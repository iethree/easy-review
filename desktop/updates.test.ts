import { afterAll, expect, test } from "bun:test";
import { $ } from "bun";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { download, installTarget, isNewer, parseLatestYml, swapScript, zipFor } from "./updates.ts";

// As electron-builder writes it (see dist/desktop/latest-mac.yml after a build).
const LATEST = `version: 0.1.7
files:
  - url: easy-review-0.1.7-x64.zip
    sha512: 11D7QO3FIHdLfgmhq06gWt62A6JWgu7/qsSWssevB99EvDfkTb2AdR6ehgRLs9nIryq3JAo2pFgURZdzTgP9xQ==
    size: 151229315
  - url: easy-review-0.1.7-arm64.zip
    sha512: 5cCx6DygHnnRPdxFZRdnL4wF65lC8mt3aT9kp2XWUW6xtuZEvKt+3gVLiRx65i2VbHZP0HWrnkywAoNXBz/+eQ==
    size: 140932953
  - url: easy-review-0.1.7-arm64.dmg
    sha512: QUNMAXT2P6JaAdyLVXpzfec+YDu0LM6eaa6zCdX5FjbDfn8tgDx2S3+1Yxgz4p+q85PyWfAMR6TmWyukOr35iw==
    size: 145144460
path: easy-review-0.1.7-x64.zip
sha512: 11D7QO3FIHdLfgmhq06gWt62A6JWgu7/qsSWssevB99EvDfkTb2AdR6ehgRLs9nIryq3JAo2pFgURZdzTgP9xQ==
releaseDate: '2026-10-26T22:49:33.467Z'
`;

test("latest-mac.yml gives the version and every file with its hash and size", () => {
  const release = parseLatestYml(LATEST);
  expect(release.version).toBe("0.1.7");
  expect(release.files.map((f) => f.url)).toEqual([
    "easy-review-0.1.7-x64.zip",
    "easy-review-0.1.7-arm64.zip",
    "easy-review-0.1.7-arm64.dmg",
  ]);
  expect(release.files[1]).toEqual({
    url: "easy-review-0.1.7-arm64.zip",
    sha512: "5cCx6DygHnnRPdxFZRdnL4wF65lC8mt3aT9kp2XWUW6xtuZEvKt+3gVLiRx65i2VbHZP0HWrnkywAoNXBz/+eQ==",
    size: 140932953,
  });
});

test("a latest-mac.yml without a version is refused", () => {
  expect(() => parseLatestYml("files: []\n")).toThrow(/no version/);
});

test("the zip is chosen by architecture, never the dmg", () => {
  const release = parseLatestYml(LATEST);
  expect(zipFor(release, "arm64")?.url).toBe("easy-review-0.1.7-arm64.zip");
  expect(zipFor(release, "x64")?.url).toBe("easy-review-0.1.7-x64.zip");
  expect(zipFor(release, "ia32")).toBeUndefined();
});

test("versions compare numerically, part by part", () => {
  expect(isNewer("0.1.10", "0.1.9")).toBe(true);
  expect(isNewer("0.2.0", "0.1.99")).toBe(true);
  expect(isNewer("1.0.0", "0.9.9")).toBe(true);
  expect(isNewer("0.1.7", "0.1.7")).toBe(false);
  expect(isNewer("0.1.6", "0.1.7")).toBe(false);
  expect(isNewer("v0.1.8", "0.1.7")).toBe(true);
});

test("an app on its disk image, or translocated, can't update itself", async () => {
  expect(await installTarget("/Volumes/easy-review/easy-review.app/Contents/MacOS/easy-review")).toEqual({
    problem: expect.stringMatching(/Applications/),
  });
  expect(
    await installTarget("/private/var/folders/x/AppTranslocation/ABC/d/easy-review.app/Contents/MacOS/easy-review"),
  ).toEqual({ problem: expect.stringMatching(/Applications/) });
  expect(await installTarget("/usr/local/bin/easy-review")).toEqual({ problem: expect.stringMatching(/bundle/) });
});

test("an app in a folder you can write to can update itself", async () => {
  const dir = await mkdtemp(join(tmpdir(), "er-target-"));
  const exec = join(dir, "easy-review.app/Contents/MacOS/easy-review");
  expect(await installTarget(exec)).toEqual({ bundle: join(dir, "easy-review.app") });
});

// --- Downloading and swapping, against a real zip of a signed bundle -------

const work = await mkdtemp(join(tmpdir(), "er-update-"));

async function fakeApp(dir: string, marker: string): Promise<string> {
  const app = join(dir, "easy-review.app");
  await mkdir(join(app, "Contents/MacOS"), { recursive: true });
  await mkdir(join(app, "Contents/Resources"), { recursive: true });
  await $`cp /usr/bin/true ${join(app, "Contents/MacOS/easy-review")}`;
  await writeFile(
    join(app, "Contents/Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>easy-review</string>
<key>CFBundleIdentifier</key><string>app.easy-review.test</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>`,
  );
  await writeFile(join(app, "Contents/Resources/marker"), marker);
  await $`codesign --force --sign - ${app}`.quiet();
  return app;
}

const built = await fakeApp(join(work, "build"), "new");
const zip = join(work, "update.zip");
await $`ditto -c -k --keepParent ${built} ${zip}`;
const zipBytes = await readFile(zip);
const sha512 = createHash("sha512").update(zipBytes).digest("base64");

const releases = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: () => new Response(zipBytes),
});
afterAll(() => releases.stop(true));
const zipUrl = `http://127.0.0.1:${releases.port}/update.zip`;

test("a download that matches its checksum and signature unpacks to the app", async () => {
  const progress: number[] = [];
  const app = await download(zipUrl, { url: "update.zip", sha512, size: zipBytes.length }, (f) => progress.push(f));
  expect(app.endsWith("easy-review.app")).toBe(true);
  expect(await readFile(join(app, "Contents/Resources/marker"), "utf8")).toBe("new");
  expect(progress.at(-1)).toBe(1);
});

test("a download that doesn't match its checksum is refused", async () => {
  await expect(
    download(zipUrl, { url: "update.zip", sha512: "AAAA", size: zipBytes.length }, () => {}),
  ).rejects.toThrow(/checksum/);
});

test("the swap replaces the bundle once the app has exited, and keeps nothing behind", async () => {
  const installed = await fakeApp(join(work, "Applications"), "old");
  const update = await download(zipUrl, { url: "update.zip", sha512, size: zipBytes.length }, () => {});
  // A process that is already gone stands in for the quitting app; `open`
  // is stubbed so the test doesn't launch anything.
  const script = swapScript().replaceAll('open "$bundle"', "true");
  await $`/bin/sh -c ${script} swap 999999 ${installed} ${update}`;
  expect(await readFile(join(installed, "Contents/Resources/marker"), "utf8")).toBe("new");
  expect(await Bun.file(`${installed}.previous/Contents/Resources/marker`).exists()).toBe(false);
});
