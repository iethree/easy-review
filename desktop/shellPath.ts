/**
 * The PATH the server should see when the app is opened from Finder.
 *
 * An app launched from the Dock gets launchd's PATH (/usr/bin:/bin:/usr/sbin:
 * /sbin), not the one your shell builds — so `gh` and `claude`, which live in
 * Homebrew's or your own bin directories, would be invisible to the server.
 * We ask your login shell for its PATH, and add the usual install locations
 * in case that fails.
 */

import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const MARKER = "__EASY_REVIEW_PATH__";

/** Where gh and claude are usually installed, for when the shell can't tell us. */
export function fallbackDirs(home = homedir()): string[] {
  return ["/opt/homebrew/bin", "/usr/local/bin", join(home, ".local/bin"), join(home, ".claude/local")];
}

/**
 * The PATH between our markers. Shell startup files can print anything
 * (banners, nvm notices), so we never trust the whole of stdout.
 */
export function parseShellOutput(stdout: string): string | undefined {
  const start = stdout.indexOf(MARKER);
  if (start < 0) return undefined;
  const end = stdout.indexOf(MARKER, start + MARKER.length);
  if (end < 0) return undefined;
  return stdout.slice(start + MARKER.length, end).trim() || undefined;
}

/** Join PATH lists in order of preference, dropping empties and repeats. */
export function mergePaths(...lists: (string | undefined)[]): string {
  const seen = new Set<string>();
  for (const list of lists) {
    for (const dir of list?.split(":") ?? []) {
      if (dir) seen.add(dir);
    }
  }
  return [...seen].join(":");
}

function askLoginShell(timeoutMs: number): Promise<string | undefined> {
  const shell = process.env.SHELL || "/bin/zsh";
  return new Promise((resolve) => {
    execFile(
      shell,
      // Interactive and login, so both .zprofile and .zshrc (or their bash
      // equivalents) run: people put PATH changes in either.
      ["-ilc", `printf '${MARKER}%s${MARKER}' "$PATH"`],
      { timeout: timeoutMs, encoding: "utf8", env: { ...process.env, DISABLE_AUTO_UPDATE: "true" } },
      (_err, stdout) => resolve(parseShellOutput(stdout ?? "")),
    );
  });
}

export async function resolvePath(current = process.env.PATH, timeoutMs = 5_000): Promise<string> {
  const fromShell = await askLoginShell(timeoutMs);
  return mergePaths(fromShell, current, fallbackDirs().join(":"));
}
