/**
 * easy-review as a macOS app.
 *
 *   bun run desktop                         run it from source
 *   bun run desktop:build                   package it  → dist/desktop/*.dmg, *.zip
 *   bun run desktop:build --arch x64        … for Intel Macs (default: this machine's)
 *   bun run desktop:build --arch all        … for both, as CI does
 *   bun run desktop:build --version 1.2.3   … stamped with this version (default: package.json's)
 *
 * The app is a thin Electron shell around the same server as everywhere else
 * (see desktop/main.ts). Packaging builds two things: the server, compiled to
 * a single binary as `bun run build` does, and the shell, bundled into
 * out/desktop/app — a directory of its own, so the app carries only the shell
 * and not this project's node_modules (the client is inside the server
 * binary already).
 */

import { $ } from "bun";
import { cp, mkdir, rm } from "node:fs/promises";

process.chdir(new URL("..", import.meta.url).pathname);

const args = process.argv.slice(2);
const packaging = args.includes("--build");
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

type Arch = "arm64" | "x64";
const archOption = option("--arch") ?? process.arch;
const arches: Arch[] = archOption === "all" ? ["arm64", "x64"] : [archOption as Arch];
if (!arches.every((a) => a === "arm64" || a === "x64")) {
  console.error(`  ✗ --arch must be arm64, x64 or all, not ${archOption}`);
  process.exit(2);
}

const pkg = (await Bun.file("package.json").json()) as { version: string; description: string };
const version = option("--version") ?? pkg.version;
const electronVersion = ((await Bun.file("node_modules/electron/package.json").json()) as { version: string }).version;

const OUT = "out/desktop";
const APP = `${OUT}/app`;

async function step(label: string, run: () => Promise<unknown>) {
  const started = performance.now();
  try {
    await run();
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString().trim();
    console.error(`\n  ✗ ${label}\n${stderr || err}`);
    process.exit(1);
  }
  console.log(`  ✓ ${label}  ${Math.round(performance.now() - started)}ms`);
}

await rm(APP, { recursive: true, force: true });
await mkdir(APP, { recursive: true });

await step("shell", async () => {
  await $`bun build ./desktop/main.ts --target node --format cjs --external electron --outfile ${APP}/main.cjs`.quiet();
  await cp("desktop/preload.cjs", `${APP}/preload.cjs`);
  await Bun.write(
    `${APP}/package.json`,
    JSON.stringify(
      { name: "easy-review", productName: "easy-review", version, description: pkg.description, main: "main.cjs" },
      null,
      2,
    ),
  );
});

if (!packaging) {
  // Electron itself downloads on first use (node_modules/electron/index.js).
  const electron = (await import("electron")).default as unknown as string;
  // Anything else on the command line is for Electron (--inspect, …).
  const env: Record<string, string | undefined> = {
    ...process.env,
    EASY_REVIEW_DEV_ROOT: process.cwd(),
    EASY_REVIEW_BUN: process.execPath,
  };
  // Set by Electron-based terminals and editors for their own children; left
  // in, Electron would start as plain Node and never open a window.
  delete env.ELECTRON_RUN_AS_NODE;
  const proc = Bun.spawn([electron, APP, ...args], { stdio: ["inherit", "inherit", "inherit"], env });
  process.exit(await proc.exited);
}

for (const arch of arches) {
  await step(`server (darwin-${arch})`, async () => {
    await rm(`${OUT}/server-${arch}`, { recursive: true, force: true });
    await $`bun build --compile --minify --target bun-darwin-${arch} ./main.ts --outfile ${OUT}/server-${arch}/easy-review`.quiet();
  });
}

const config = {
  appId: "app.easy-review",
  productName: "easy-review",
  electronVersion,
  directories: { app: APP, output: "dist/desktop" },
  // Just the shell. electron-builder would otherwise pack this project's
  // dependencies too, which the server binary already carries.
  files: ["main.cjs", "preload.cjs", "package.json", "!node_modules/**"],
  npmRebuild: false,
  // The app is not a Node runtime for anyone else to borrow. This also makes it
  // ignore ELECTRON_RUN_AS_NODE, which Electron-based terminals pass on to
  // whatever they `open`.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    onlyLoadAppFromAsar: true,
  },
  // electron-builder fills in ${arch} for each architecture it packages.
  extraResources: [{ from: `${OUT}/server-\${arch}`, to: "server" }],
  artifactName: "${productName}-${version}-${arch}.${ext}",
  mac: {
    category: "public.app-category.developer-tools",
    // electron-builder makes the .icns from it. Redraw with `bun scripts/icon.ts`.
    icon: "desktop/icon.png",
    target: ["dmg", "zip"],
    darkModeSupport: true,
    // Signed with the Developer ID that CSC_LINK (a .p12) or CSC_NAME (a
    // keychain identity) points to; otherwise ad hoc, which is enough on the
    // Mac that built it.
    ...(process.env.CSC_LINK || process.env.CSC_NAME ? {} : { identity: "-" }),
  },
  dmg: { title: "easy-review" },
};
await Bun.write(`${OUT}/electron-builder.json`, JSON.stringify(config, null, 2));

await rm("dist/desktop", { recursive: true, force: true });
await step(`app ${version} (${arches.join(", ")})`, async () => {
  // electron-builder is Node software; run it under Node. One run for every
  // architecture, so its latest-mac.yml lists them all. Publishing is CI's
  // job (.github/workflows/release.yml), never electron-builder's.
  const archFlags = arches.map((a) => `--${a}`);
  await $`node node_modules/electron-builder/cli.js --mac ${archFlags} --publish never --config ${OUT}/electron-builder.json`.quiet();
});

const here = arches.includes(process.arch as Arch) ? (process.arch as Arch) : arches[0];
console.log(`\n  Open it:  open "dist/desktop/mac${here === "arm64" ? "-arm64" : ""}/easy-review.app"\n`);
