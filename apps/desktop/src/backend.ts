import { homedir } from "node:os";
import { join } from "node:path";
import { readLock } from "../../../packages/server/src/lib/lockfile";

function livePort(home: string): number | undefined {
  const lock = readLock(home);
  if (!lock || !Number.isInteger(lock.port) || lock.port < 1 || lock.port > 65535) return;
  try {
    process.kill(lock.pid, 0);
    return lock.port;
  } catch {
    return;
  }
}

async function ready(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/agents`, {
      signal: AbortSignal.timeout(1_000),
    });
    const body = await response.json() as { ok?: boolean; data?: unknown };
    return response.ok && body.ok === true && Array.isArray(body.data);
  } catch {
    return false;
  }
}

/** Attach to the per-home daemon, or own a packaged CLI child until desktop exit. */
export async function connectBackend(cliPath: string) {
  const home = process.env.HARBOR_HOME ?? join(homedir(), ".harbor");
  let port = livePort(home);
  let child: ReturnType<typeof Bun.spawn> | undefined;
  if (port === undefined) {
    port = Number(process.env.HARBOR_PORT ?? 11123);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid HARBOR_PORT");
    child = Bun.spawn([cliPath, "serve", "--port", String(port)], {
      env: { ...process.env, HARBOR_HOME: home },
      stdout: "inherit",
      stderr: "inherit",
    });
  }
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    const timeout = setTimeout(() => child?.kill("SIGKILL"), 5_000);
    try { await child.exited; } finally { clearTimeout(timeout); }
  }
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      // A concurrent CLI/desktop may have won the single-instance lock.
      const lockPort = livePort(home);
      port = lockPort ?? port;
      if (lockPort !== undefined && await ready(lockPort)) return { url: `http://127.0.0.1:${port}`, stop };
      if (child && child.exitCode !== null && livePort(home) === undefined) {
        throw new Error(`Harbor backend exited with code ${child.exitCode}`);
      }
      await Bun.sleep(150);
    }
    throw new Error(`Harbor backend did not become ready on port ${port}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
