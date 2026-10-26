/**
 * The version CI releases next.
 *
 *   bun scripts/version.ts      prints it, e.g. 0.1.4
 *
 * package.json says which series is current — major and minor, say 0.1 —
 * and every push to main is the next patch in it: v0.1.0, v0.1.1, v0.1.2 …
 * To start a new series, change the version in package.json to 0.2.0.
 * Tags already on GitHub are the record of what has been released, so
 * nothing has to be committed back.
 */

import { $ } from "bun";

type Version = [number, number, number];

export function parseVersion(text: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** One past the highest released patch in package.json's series. */
export function nextVersion(packageVersion: string, tags: string[]): string {
  const base = parseVersion(packageVersion);
  if (!base) throw new Error(`package.json's version isn't major.minor.patch: ${packageVersion}`);
  const [major, minor, floor] = base;

  let next = floor;
  for (const tag of tags) {
    const v = parseVersion(tag);
    if (v && v[0] === major && v[1] === minor && v[2] >= next) next = v[2] + 1;
  }
  return `${major}.${minor}.${next}`;
}

/** Tag names on GitHub, which the CI checkout may not have fetched. */
export function tagsFromLsRemote(output: string): string[] {
  return output
    .split("\n")
    .map((line) => /refs\/tags\/([^\s^]+)$/.exec(line.trim())?.[1])
    .filter((tag): tag is string => tag !== undefined);
}

if (import.meta.main) {
  const pkg = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as { version: string };
  const remote = await $`git ls-remote --tags origin`.text();
  console.log(nextVersion(pkg.version, tagsFromLsRemote(remote)));
}
