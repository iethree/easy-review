/**
 * Updates, as you see them: a quiet check at launch that speaks up only when
 * there's a newer release, and "Check for Updates…" in the app menu (on
 * Linux, the Help menu), which always answers. Nothing is downloaded until you say so. See updates.ts for
 * how a release is found and installed.
 */

import { app, BrowserWindow, dialog, shell } from "electron";

import { download, fetchLatest, installAfterExit, installTarget, isNewer, RELEASES, zipFor } from "./updates.ts";

let busy = false;

function parent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

async function message(options: Electron.MessageBoxOptions) {
  const win = parent();
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

/** `manual`: you asked, so say so when there's nothing new, or it failed. */
export async function checkForUpdates({ manual }: { manual: boolean }): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await check(manual);
  } catch (err) {
    if (manual) {
      await message({
        type: "error",
        message: "Couldn't update easy-review",
        detail: err instanceof Error ? err.message : String(err),
      });
    } else {
      console.error("update check failed:", err);
    }
  } finally {
    busy = false;
    parent()?.setProgressBar(-1);
  }
}

async function check(manual: boolean) {
  const current = app.getVersion();
  const release = await fetchLatest();
  // Only the macOS app replaces itself. On Linux, the AppImage or .deb you
  // installed is yours to replace, so it gets a link to the release instead.
  const installs = process.platform === "darwin";
  const file = installs ? zipFor(release, process.arch) : undefined;

  if (!isNewer(release.version, current) || (installs && !file)) {
    if (manual) {
      await message({ type: "info", message: "easy-review is up to date", detail: `You have version ${current}.` });
    }
    return;
  }

  if (!file) {
    const { response } = await message({
      type: "info",
      message: `easy-review ${release.version} is available`,
      detail: `You have version ${current}. Download the new version from its release page.`,
      buttons: ["Open Release Page", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) void shell.openExternal(`${RELEASES}/tag/v${release.version}`);
    return;
  }

  const { response } = await message({
    type: "info",
    message: `easy-review ${release.version} is available`,
    detail: `You have version ${current}. Update now? easy-review will restart.`,
    buttons: ["Update and Restart", "Later", "Release Notes"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 2) void shell.openExternal(`${RELEASES}/tag/v${release.version}`);
  if (response !== 0) return;

  if (!app.isPackaged) throw new Error("Updates install only into the packaged app, not one run from source.");
  const target = await installTarget(process.execPath);
  if ("problem" in target) throw new Error(target.problem);

  // The Dock icon shows the download's progress.
  const url = `${RELEASES}/download/v${release.version}/${file.url}`;
  const update = await download(url, file, (fraction) => parent()?.setProgressBar(fraction));

  installAfterExit(process.pid, target.bundle, update);
  app.quit();
}
