import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runServiceCommand, serviceArguments, serviceContext } from "./context";
import type { ServiceContext } from "./context";

const LABEL = "org.harbor.server";

export type LaunchdContext = ServiceContext;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderPlist(context: LaunchdContext): string {
  const { harborHome, path, port, dbPath } = context;
  const outLog = join(harborHome, "logs", "server.out.log");
  const errLog = join(harborHome, "logs", "server.err.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${serviceArguments(context).map((arg) => `    <string>${escapeXml(arg)}</string>`).join("\n")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HARBOR_HOME</key>
    <string>${escapeXml(harborHome)}</string>${path !== undefined ? `
    <key>PATH</key>
    <string>${escapeXml(path)}</string>` : ""}${port !== undefined ? `
    <key>HARBOR_PORT</key>
    <string>${escapeXml(port)}</string>` : ""}${dbPath !== undefined ? `
    <key>HARBOR_DB_PATH</key>
    <string>${escapeXml(dbPath)}</string>` : ""}
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(outLog)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(errLog)}</string>
</dict>
</plist>
`;
}

function plistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

export async function installLaunchd(): Promise<void> {
  const context = serviceContext();
  const { harborHome } = context;
  mkdirSync(join(harborHome, "logs"), { recursive: true });

  const plist = renderPlist(context);
  const path = plistPath();
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(path, plist);

  const uid = process.getuid?.() ?? 0;
  await runServiceCommand(["launchctl", "bootout", `gui/${uid}/${LABEL}`], false);
  await runServiceCommand(["launchctl", "bootstrap", `gui/${uid}`, path]);
}

export async function uninstallLaunchd(): Promise<void> {
  const uid = process.getuid?.() ?? 0;
  await runServiceCommand(["launchctl", "bootout", `gui/${uid}/${LABEL}`], false);
  try {
    unlinkSync(plistPath());
  } catch {
    // ignore — best effort
  }
}

export async function launchdStatus(): Promise<{ registered: boolean }> {
  const uid = process.getuid?.() ?? 0;
  const code = await runServiceCommand(["launchctl", "print", `gui/${uid}/${LABEL}`], false);
  return { registered: code === 0 };
}
