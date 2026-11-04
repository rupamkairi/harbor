import Electrobun, { ApplicationMenu, BrowserWindow, PATHS, Utils } from "electrobun/bun";
import { join } from "node:path";
import { connectBackend } from "./backend";
import { startGateway } from "./gateway";

const resources = join(PATHS.RESOURCES_FOLDER, "app");
const backend = await connectBackend(join(resources, process.platform === "win32" ? "harbor-cli.exe" : "harbor-cli"));
const devUrl = process.env.HARBOR_DESKTOP_DEV_URL;
if (devUrl && !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/$/.test(devUrl)) {
  await backend.stop();
  throw new Error("HARBOR_DESKTOP_DEV_URL must be a loopback HTTP origin");
}
let gateway;
try {
  gateway = devUrl
    ? { url: devUrl, stop() {} }
    : startGateway(join(resources, "web-dist"), backend.url);
} catch (error) {
  await backend.stop();
  throw error;
}

let quitting = false;
let cleanedUp = false;
Electrobun.events.on("before-quit", (event) => {
  if (cleanedUp) return;
  event.response = { allow: false };
  if (quitting) return;
  quitting = true;
  gateway.stop();
  void backend.stop().finally(() => {
    cleanedUp = true;
    Utils.quit();
  });
});

process.on("SIGINT", () => Utils.quit());
process.on("SIGTERM", () => Utils.quit());

try {
  ApplicationMenu.setApplicationMenu([
    { label: "Harbor", submenu: [{ label: "Quit Harbor", role: "quit" }] },
    { label: "Edit", submenu: [
      { label: "Undo", role: "undo" },
      { label: "Redo", role: "redo" },
      { label: "Cut", role: "cut" },
      { label: "Copy", role: "copy" },
      { label: "Paste", role: "paste" },
      { label: "Select All", role: "selectAll" },
    ] },
  ]);

  new BrowserWindow({
    title: "Harbor",
    url: gateway.url,
    frame: { x: 100, y: 100, width: 1280, height: 840 },
    // Keep native capabilities in the main process; the UI uses the existing HTTP API.
    navigationRules: JSON.stringify(["^*", `${gateway.url}*`]),
  });

} catch (error) {
  gateway.stop();
  await backend.stop();
  throw error;
}
