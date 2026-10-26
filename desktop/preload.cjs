/**
 * The bridge between the app window and the main process. It runs before the
 * page's own scripts, in a separate JavaScript world that shares the DOM.
 *
 * Plain CommonJS, not TypeScript: a sandboxed preload can't be an ES module,
 * and it is too small to be worth a build step.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("easyReviewDesktop", {
  platform: process.platform,
  /** Menu commands (settings, refresh, help). Returns an unsubscribe function. */
  onCommand(callback) {
    const listener = (_event, name) => callback(name);
    ipcRenderer.on("command", listener);
    return () => ipcRenderer.removeListener("command", listener);
  },
});

// Window state the stylesheet adapts to: the traffic lights vanish in full
// screen, and macOS dims a window's toolbar while another window is in front.
ipcRenderer.on("fullscreen", (_event, value) => {
  document.documentElement.toggleAttribute("data-fullscreen", value);
});
window.addEventListener("blur", () => document.documentElement.setAttribute("data-inactive", ""));
window.addEventListener("focus", () => document.documentElement.removeAttribute("data-inactive"));
