/**
 * Render the app icon: desktop/icon.svg → desktop/icon.png (1024×1024).
 *
 *   bun scripts/icon.ts
 *
 * The PNG is committed: electron-builder makes the .icns from it, and
 * `bun run desktop` puts it in the Dock. Chromium does the drawing — Electron
 * is here already, and no SVG renderer ships with macOS.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const svg = join(root, "desktop/icon.svg");
const png = join(root, "desktop/icon.png");
const SIZE = 1024;

// Inlined: a data: page may not load file: URLs.
const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(await Bun.file(svg).arrayBuffer()).toString("base64")}`;

// A throwaway main process: draw the SVG offscreen at 1x and save the frame.
const renderer = `
const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("node:fs");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: ${SIZE}, height: ${SIZE}, show: false, transparent: true, frame: false,
    useContentSize: true, webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(1);
  const html = '<html><body style="margin:0;background:transparent"><img src="${svgDataUrl}" width="${SIZE}" height="${SIZE}" style="display:block"></body></html>';
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 500));
  const image = await win.webContents.capturePage();
  writeFileSync(${JSON.stringify(png)}, image.resize({ width: ${SIZE}, height: ${SIZE}, quality: "best" }).toPNG());
  app.quit();
});
`;

const dir = await mkdtemp(join(tmpdir(), "er-icon-"));
await Bun.write(join(dir, "main.cjs"), renderer);
const electron = (await import("electron")).default as unknown as string;
const env: Record<string, string | undefined> = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const proc = Bun.spawn([electron, "--force-device-scale-factor=1", join(dir, "main.cjs")], {
  stdio: ["ignore", "inherit", "inherit"],
  env,
});
const code = await proc.exited;
await rm(dir, { recursive: true, force: true });
if (code !== 0) process.exit(code);
console.log(`  ✓ ${png}`);
