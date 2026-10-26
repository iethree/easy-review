/**
 * easy-review as a macOS app: Electron's main process.
 *
 * It starts the server (see server.ts), serves it to the window through the
 * easy-review:// scheme (see proxy.ts), and supplies what a web page can't:
 * a native title bar, menus, a context menu, and links that open in your
 * browser instead of in the app.
 *
 * `bun run desktop` runs it from source; `bun run desktop:build` packages it.
 */

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  protocol,
  screen,
  shell,
} from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { APP_ORIGIN, forward, SCHEME } from "./proxy.ts";
import { type RunningServer, type ServerCommand, startServer } from "./server.ts";
import { resolvePath } from "./shellPath.ts";
import { checkForUpdates } from "./updater.ts";

const isMac = process.platform === "darwin";
/** Set by scripts/desktop.ts when running from source. */
const devRoot = process.env.EASY_REVIEW_DEV_ROOT;

// Must happen before the app is ready: a standard, secure scheme gets its
// own origin, localStorage and fetch, like https.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

let server: RunningServer | null = null;
let window: BrowserWindow | null = null;
let quitting = false;

function serverCommand(): ServerCommand {
  if (devRoot) {
    return { command: process.env.EASY_REVIEW_BUN ?? "bun", args: ["main.ts"], cwd: devRoot };
  }
  // Not the project directory: Bun loads a .env from its working directory,
  // and the app has no business reading one from wherever it was opened.
  return { command: join(process.resourcesPath, "server", "easy-review"), args: [], cwd: app.getPath("userData") };
}

function isExternal(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("mailto:");
}

// --- Window size and position, kept between launches -----------------------

type Bounds = { x: number; y: number; width: number; height: number };

const boundsFile = () => join(app.getPath("userData"), "window.json");

function savedBounds(): Bounds | undefined {
  try {
    const b = JSON.parse(readFileSync(boundsFile(), "utf8")) as Bounds;
    // Only if it still lands on a screen: displays come and go.
    const area = screen.getDisplayMatching(b).workArea;
    const visible =
      b.x < area.x + area.width && b.x + b.width > area.x && b.y < area.y + area.height && b.y + b.height > area.y;
    return visible ? b : undefined;
  } catch {
    return undefined;
  }
}

function saveBounds(win: BrowserWindow) {
  try {
    writeFileSync(boundsFile(), JSON.stringify(win.getNormalBounds()));
  } catch {
    // Not worth interrupting a quit over.
  }
}

// --- The window ------------------------------------------------------------

function send(channel: string, value: unknown) {
  window?.webContents.send(channel, value);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    ...savedBounds(),
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: "easy-review",
    // The page's top bar becomes the title bar, with the traffic lights
    // inset into it and centred on its 52px (see [data-desktop] in app.css).
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#242424" : "#ffffff",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  window = win;

  win.once("ready-to-show", () => win.show());
  win.on("close", () => saveBounds(win));
  win.on("closed", () => {
    if (window === win) window = null;
  });
  win.on("enter-full-screen", () => send("fullscreen", true));
  win.on("leave-full-screen", () => send("fullscreen", false));

  // Links open in your browser. The app only ever shows its own pages.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${APP_ORIGIN}/`)) return;
    event.preventDefault();
    if (isExternal(url)) void shell.openExternal(url);
  });
  // A native app doesn't zoom when you pinch the trackpad.
  win.webContents.on("did-finish-load", () => void win.webContents.setVisualZoomLevelLimits(1, 1));
  win.webContents.on("context-menu", (_event, params) => {
    const items: MenuItemConstructorOptions[] = [];
    if (params.linkURL && isExternal(params.linkURL)) {
      items.push(
        { label: "Open Link in Browser", click: () => void shell.openExternal(params.linkURL) },
        { label: "Copy Link", click: () => clipboard.writeText(params.linkURL) },
        { type: "separator" },
      );
    }
    if (params.isEditable) {
      items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { type: "separator" }, { role: "selectAll" });
    } else if (params.selectionText) {
      items.push({ role: "copy" });
    }
    if (devRoot) {
      items.push({ type: "separator" }, { label: "Inspect Element", click: () => win.webContents.inspectElement(params.x, params.y) });
    }
    while (items.at(-1)?.type === "separator") items.pop();
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: win });
  });

  void win.loadURL(`${APP_ORIGIN}/`);
}

function showWindow() {
  if (!window) createWindow();
  else {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
}

// --- Menus -----------------------------------------------------------------

function buildMenu() {
  const command = (name: string) => () => {
    showWindow();
    send("command", name);
  };
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { label: "Check for Updates…", click: () => void checkForUpdates({ manual: true }) },
              { type: "separator" },
              { label: "Settings…", accelerator: "Cmd+,", click: command("settings") },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    // Without an Edit menu, macOS gives text fields no copy and paste.
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Refresh from GitHub", accelerator: "CmdOrCtrl+R", click: command("refresh") },
        { label: "Reload Window", accelerator: "CmdOrCtrl+Alt+R", role: "reload" },
        ...(devRoot ? [{ role: "toggleDevTools" } satisfies MenuItemConstructorOptions] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [{ label: "Keyboard Shortcuts", accelerator: "CmdOrCtrl+/", click: command("help") }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Lifecycle -------------------------------------------------------------

async function start() {
  // Finder gives an app launchd's bare PATH; the server needs your shell's to
  // find gh, git and claude. From a terminal, the PATH is already right.
  const env = { ...process.env } as Record<string, string>;
  if (app.isPackaged) env.PATH = await resolvePath(process.env.PATH);

  try {
    server = await startServer(serverCommand(), env);
  } catch (err) {
    dialog.showErrorBox("easy-review couldn't start", err instanceof Error ? err.message : String(err));
    app.exit(1);
    return;
  }

  const running = server;
  running.child.on("exit", () => {
    if (quitting) return;
    dialog.showErrorBox("easy-review stopped", `The server exited unexpectedly.\n\n${running.output().trim()}`);
    app.exit(1);
  });

  protocol.handle(SCHEME, (request) => forward(request, running.origin));
  // A packaged app has its icon in the bundle; from source, Electron's own
  // would be in the Dock.
  if (devRoot && isMac) app.dock?.setIcon(join(devRoot, "desktop/icon.png"));
  buildMenu();
  createWindow();

  // Once the window is up, look for a newer release; say nothing if there
  // isn't one. Only a packaged app has a version to compare.
  if (app.isPackaged) setTimeout(() => void checkForUpdates({ manual: false }), 5_000);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.on("activate", () => {
    if (server) showWindow();
  });
  // macOS apps stay open with no windows; everywhere else, closing is quitting.
  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => server?.stop());
  void app.whenReady().then(start);
}
