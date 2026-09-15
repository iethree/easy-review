/**
 * Build easy-review as a single executable.
 *
 *   bun run build       this machine                     → dist/easy-review
 *   bun run build:all   macOS and Linux, arm64 and x64   → dist/easy-review-<os>-<arch>
 *
 * The binary carries the Bun runtime, the server and the whole client, so it
 * runs on a machine with nothing installed but `gh` (and `claude`, for Claude
 * reviews): no Bun, no Node, no `bun install`.
 *
 * Cross-platform builds use Go's os-arch names (amd64, not x64), which is what
 * gh matches release assets against when installing a precompiled extension.
 */

import { $ } from "bun";

const TARGETS = [
  { bun: "bun-darwin-arm64", name: "darwin-arm64" },
  { bun: "bun-darwin-x64", name: "darwin-amd64" },
  { bun: "bun-linux-arm64", name: "linux-arm64" },
  { bun: "bun-linux-x64", name: "linux-amd64" },
];

const all = process.argv.includes("--all");
// Everything below is relative to the project, wherever this was run from.
process.chdir(new URL("..", import.meta.url).pathname);

const builds = all
  ? TARGETS.map((t) => ({ target: ["--target", t.bun], outfile: `dist/easy-review-${t.name}` }))
  : [{ target: [], outfile: "dist/easy-review" }];

await $`rm -rf dist`;

for (const { target, outfile } of builds) {
  const started = performance.now();
  try {
    await $`bun build --compile --minify ${target} ./main.ts --outfile ${outfile}`.quiet();
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString().trim();
    console.error(`\n  ✗ ${outfile}\n${stderr || err}`);
    process.exit(1);
  }
  const mb = (Bun.file(outfile).size / 1024 / 1024).toFixed(0);
  console.log(`  ✓ ${outfile}  ${mb}MB  ${Math.round(performance.now() - started)}ms`);
}

if (!all) console.log("\n  Run it:  ./dist/easy-review\n");
