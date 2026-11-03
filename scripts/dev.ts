import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const webRoot = join(root, "apps/web");
const viteEntry = join(dirname(Bun.resolveSync("vite/package.json", webRoot)), "bin/vite.js");
// Spawn runtime processes directly so signals reach the server and Vite rather
// than stopping an intermediate package-script shell and leaving its children.
const commands = [
  { args: ["--watch", "packages/server/src/index.ts"], cwd: root },
  { args: [viteEntry], cwd: webRoot },
];
const children = commands.map(({ args, cwd }) =>
  Bun.spawn([process.execPath, ...args], {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }),
);

let stopping = false;
function stop(): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }, 5_000);
  timer.unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const first = await Promise.race(children.map(async (child) => ({ code: await child.exited })));
stop();
await Promise.all(children.map((child) => child.exited));
process.exitCode = first.code;
