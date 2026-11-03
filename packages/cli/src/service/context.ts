import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ServiceContext {
  /** Bun when running from source; the standalone Harbor executable when compiled. */
  bunPath: string;
  cliEntry?: string;
  harborHome: string;
  path?: string;
  port?: string;
  dbPath?: string;
}

export function serviceContext(): ServiceContext {
  // Bun's compiled entry is virtual and must never be passed as a script path.
  const compiled = /^(?:\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(Bun.main);
  return {
    bunPath: process.execPath,
    cliEntry: compiled ? undefined : fileURLToPath(new URL("../index.ts", import.meta.url)),
    harborHome: resolve(process.env.HARBOR_HOME ?? join(homedir(), ".harbor")),
    path: process.env.PATH,
    port: process.env.HARBOR_PORT,
    dbPath: process.env.HARBOR_DB_PATH === undefined ? undefined : resolve(process.env.HARBOR_DB_PATH),
  };
}

export function serviceArguments(context: ServiceContext): string[] {
  return [context.bunPath, ...(context.cliEntry ? [context.cliEntry] : []), "serve"];
}

export async function runServiceCommand(cmd: string[], required = true): Promise<number> {
  const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  if (required && code !== 0) {
    throw new Error(`${cmd.join(" ")} failed (exit ${code}): ${stderr.trim()}`);
  }
  return code;
}
