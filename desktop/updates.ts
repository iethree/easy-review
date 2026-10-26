/**
 * Finding, fetching and installing a newer release of the app.
 *
 * Releases are on GitHub (.github/workflows/release.yml), each with a
 * latest-mac.yml that names the zip for each architecture and its SHA-512.
 *
 * Why not electron-updater? On macOS it hands over to Squirrel.Mac, which
 * installs an update only if it is signed by the same Developer ID as the
 * running app. Release builds are signed ad hoc, so every update would be
 * refused. Instead: download the zip, check its hash and its signature,
 * and swap the bundle in place once the app has quit.
 */

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, constants, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Overridable so a test build can update from a local server. */
export const RELEASES = process.env.EASY_REVIEW_RELEASES ?? "https://github.com/iethree/easy-review/releases";

export interface ReleaseFile {
  url: string;
  sha512: string;
  size: number;
}

export interface Release {
  version: string;
  files: ReleaseFile[];
}

/**
 * The parts of latest-mac.yml we use. electron-builder writes it in one
 * fixed shape, so this reads that shape rather than YAML in general.
 */
export function parseLatestYml(text: string): Release {
  let version = "";
  const files: ReleaseFile[] = [];
  let current: Partial<ReleaseFile> | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const top = /^(\w+):\s*(.*)$/.exec(line);
    if (top) {
      current = null;
      if (top[1] === "version") version = unquote(top[2] ?? "");
      continue;
    }
    const item = /^\s*-\s+(\w+):\s*(.*)$/.exec(line);
    const field = item ?? /^\s+(\w+):\s*(.*)$/.exec(line);
    if (!field) continue;
    if (item) {
      current = {};
      files.push(current as ReleaseFile);
    }
    if (!current) continue;
    const [, key, value = ""] = field;
    if (key === "url") current.url = unquote(value);
    else if (key === "sha512") current.sha512 = unquote(value);
    else if (key === "size") current.size = Number(value);
  }

  if (!version) throw new Error("latest-mac.yml has no version");
  return { version, files: files.filter((f) => f.url && f.sha512) };
}

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, "$2");
}

function parts(version: string): number[] {
  return version.replace(/^v/, "").split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** The zip built for this Mac's architecture. */
export function zipFor(release: Release, arch: string): ReleaseFile | undefined {
  return release.files.find((f) => f.url.endsWith(`-${arch}.zip`));
}

export async function fetchLatest(releases = RELEASES): Promise<Release> {
  const res = await fetch(`${releases}/latest/download/latest-mac.yml`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Couldn't check for updates (HTTP ${res.status})`);
  return parseLatestYml(await res.text());
}

/**
 * The bundle this app runs from, and whether it can be replaced. An app
 * opened straight from its disk image, or one that macOS has "translocated"
 * (run from a random read-only path because it was never moved after
 * download), can't be — it has to be in Applications first.
 */
export async function installTarget(execPath: string): Promise<{ bundle: string } | { problem: string }> {
  const bundle = dirname(dirname(dirname(execPath)));
  if (!bundle.endsWith(".app")) return { problem: "This copy of easy-review isn't an app bundle." };
  if (bundle.includes("/AppTranslocation/") || bundle.startsWith("/Volumes/")) {
    return { problem: "Move easy-review to your Applications folder, open it from there, and try again." };
  }
  try {
    await access(dirname(bundle), constants.W_OK);
  } catch {
    return { problem: `easy-review can't replace itself in ${dirname(bundle)}, which you can't write to.` };
  }
  return { bundle };
}

/**
 * Download the zip to a new temporary directory, checking its SHA-512 as it
 * arrives. Resolves to the unpacked .app.
 */
export async function download(
  url: string,
  expected: ReleaseFile,
  onProgress: (fraction: number) => void,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length")) || expected.size || 0;

  const dir = await mkdtemp(join(tmpdir(), "easy-review-update-"));
  const zip = join(dir, "update.zip");
  const out = createWriteStream(zip);
  const hash = createHash("sha512");
  let received = 0;

  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    hash.update(chunk);
    received += chunk.length;
    if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
    if (total) onProgress(Math.min(received / total, 1));
  }
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));

  if (hash.digest("base64") !== expected.sha512) {
    throw new Error("The download doesn't match the release's checksum, so it wasn't installed.");
  }

  const unpacked = join(dir, "unpacked");
  // ditto, not unzip: it keeps the symlinks and extended attributes the
  // bundle's code signature covers.
  await run("ditto", ["-x", "-k", zip, unpacked]);
  const app = (await readdir(unpacked)).find((name) => name.endsWith(".app"));
  if (!app) throw new Error("The download has no app in it.");
  const path = join(unpacked, app);
  // Ad hoc or not, a signature that doesn't verify means the bundle isn't
  // what was built.
  await run("codesign", ["--verify", "--deep", "--strict", path]);
  return path;
}

/**
 * Replace `bundle` with `update` once process `pid` has exited, then open it.
 * Runs as a detached shell so it outlives the app. If the swap fails part
 * way, the old bundle is put back.
 */
export function swapScript(): string {
  return [
    'pid="$1"; bundle="$2"; update="$3"; old="$bundle.previous"',
    'while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done',
    'rm -rf "$old"',
    'mv "$bundle" "$old" || { open "$bundle"; exit 1; }',
    'if mv "$update" "$bundle"; then rm -rf "$old"; else mv "$old" "$bundle"; fi',
    'open "$bundle"',
  ].join("\n");
}

export function installAfterExit(pid: number, bundle: string, update: string): void {
  const child = spawn("/bin/sh", ["-c", swapScript(), "swap", String(pid), bundle, update], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
