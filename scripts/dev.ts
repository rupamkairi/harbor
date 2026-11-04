import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const webRoot = join(root, "apps/web");
const viteEntry = join(dirname(Bun.resolveSync("vite/package.json", webRoot)), "bin/vite.js");
const webUrl = "http://127.0.0.1:11124/";
const children: ReturnType<typeof Bun.spawn>[] = [];
let stopping = false;
let forceStop: ReturnType<typeof setTimeout> | undefined;

function spawn(args: string[], cwd = root, env = process.env) {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd, env, stdin: "inherit", stdout: "inherit", stderr: "inherit",
  });
  children.push(child);
  return child;
}

function stop(): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  forceStop = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
  }, 5_000);
  forceStop.unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function waitFor(url: string, isReady: (response: Response) => Promise<boolean>) {
  const deadline = Date.now() + 60_000;
  while (!stopping && Date.now() < deadline) {
    if (children.some((child) => child.exitCode !== null)) throw new Error("A development process exited during startup");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (await isReady(response)) return;
    } catch { /* Retry while the server starts. */ }
    await Bun.sleep(150);
  }
  throw new Error(stopping ? "Development startup interrupted" : `Timed out waiting for ${url}`);
}

try {
  // Electrobun copies the CLI and UI into its development bundle, even though
  // its window loads Vite for HMR and attaches to the watched API below.
  const packaged = spawn(["run", "package:cli"]);
  const code = await packaged.exited;
  if (code !== 0 || stopping) throw new Error(`Desktop prerequisites exited (${code})`);
  children.splice(children.indexOf(packaged), 1);

  spawn(["--watch", "packages/server/src/index.ts"]);
  spawn([viteEntry, "--host", "127.0.0.1", "--strictPort"], webRoot);
  await Promise.all([
    waitFor(`http://127.0.0.1:${process.env.HARBOR_PORT ?? 11123}/api/v1/agents`, async (response) => {
      const body = await response.json() as { ok?: boolean; data?: unknown };
      return response.ok && body.ok === true && Array.isArray(body.data);
    }),
    waitFor(webUrl, async (response) => response.ok && (await response.text()).includes("/@vite/client")),
  ]);
  spawn(["scripts/electrobun.ts", "dev"], join(root, "apps/desktop"), {
    ...process.env, HARBOR_DESKTOP_DEV_URL: webUrl,
  });
  const first = await Promise.race(children.map(async (child) => child.exited));
  process.exitCode = first;
} catch (error) {
  if (!stopping) console.error(error);
  process.exitCode = stopping ? 0 : 1;
} finally {
  stop();
  await Promise.all(children.map((child) => child.exited));
  clearTimeout(forceStop);
}
