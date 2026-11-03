import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runServiceCommand, serviceArguments, serviceContext } from "./context";
import type { ServiceContext } from "./context";

const UNIT_NAME = "harbor";

export type SystemdContext = ServiceContext;

function quote(value: string, command = false): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%")
    .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  return `"${command ? escaped.replace(/\$/g, "$$$$") : escaped}"`;
}

export function renderUnit(context: SystemdContext): string {
  const { harborHome, path, port, dbPath } = context;
  return `[Unit]
Description=Harbor server

[Service]
ExecStart=${serviceArguments(context).map((arg) => quote(arg, true)).join(" ")}
Restart=on-failure
RestartSec=5
Environment=${quote(`HARBOR_HOME=${harborHome}`)}${path !== undefined ? `\nEnvironment=${quote(`PATH=${path}`)}` : ""}${port !== undefined ? `\nEnvironment=${quote(`HARBOR_PORT=${port}`)}` : ""}${dbPath !== undefined ? `\nEnvironment=${quote(`HARBOR_DB_PATH=${dbPath}`)}` : ""}

[Install]
WantedBy=default.target
`;
}

function unitPath(): string {
  return join(homedir(), ".config", "systemd", "user", `${UNIT_NAME}.service`);
}

export async function installSystemd(): Promise<void> {
  const context = serviceContext();
  const { harborHome } = context;
  mkdirSync(join(harborHome, "logs"), { recursive: true });

  const unit = renderUnit(context);
  const path = unitPath();
  mkdirSync(join(homedir(), ".config", "systemd", "user"), { recursive: true });
  writeFileSync(path, unit);

  await runServiceCommand(["systemctl", "--user", "daemon-reload"]);
  await runServiceCommand(["systemctl", "--user", "enable", "--now", UNIT_NAME]);
}

export async function uninstallSystemd(): Promise<void> {
  await runServiceCommand(["systemctl", "--user", "disable", "--now", UNIT_NAME], false);
  try {
    unlinkSync(unitPath());
  } catch {
    // ignore — best effort
  }
  await runServiceCommand(["systemctl", "--user", "daemon-reload"]);
}

export async function systemdStatus(): Promise<{ registered: boolean }> {
  const code = await runServiceCommand(["systemctl", "--user", "is-active", UNIT_NAME], false);
  return { registered: code === 0 };
}
