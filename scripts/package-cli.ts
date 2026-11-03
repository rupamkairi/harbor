import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function run(args: string[], cwd = root): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`bun ${args.join(" ")} failed (${code})`);
}

await run(["run", "--cwd", "apps/web", "build"]);
await mkdir(join(root, "dist"), { recursive: true });
await run([
  "build", "--compile", join(root, "packages/cli/src/index.ts"), "--outfile",
  join(root, "dist", process.platform === "win32" ? "harbor.exe" : "harbor"),
], join(root, "dist"));
await rm(join(root, "dist/web-dist"), { recursive: true, force: true });
await cp(join(root, "apps/web/dist"), join(root, "dist/web-dist"), { recursive: true });
console.log("Packaged Harbor CLI and web UI in dist/");
