import { readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--all")) throw new Error("Usage: bun run clean [--all]");
let count = 0;
let bytes = 0;

async function clean(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name === ".git" || entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await clean(path);
    else if (entry.isFile() && (entry.name.endsWith(".bun-build") || entry.name.endsWith(".tsbuildinfo"))) {
      bytes += (await stat(path)).size;
      await rm(path);
      count++;
    }
  }
}

await clean(root);
if (args.includes("--all")) {
  for (const output of ["dist", "apps/web/dist", "apps/desktop/build", "apps/desktop/artifacts"]) {
    await rm(join(root, output), { recursive: true, force: true });
  }
}
console.log(`Removed ${count} compiler intermediates (${(bytes / 1024 ** 2).toFixed(1)} MiB).`);
if (args.includes("--all")) console.log("Removed generated CLI, web, and desktop outputs.");
