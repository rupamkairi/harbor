import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sdk = join(dirname(fileURLToPath(import.meta.resolve("electrobun"))), "../../..");
const binary = join(sdk, "bin", process.platform === "win32" ? "electrobun.exe" : "electrobun");

async function run(command: string[], quiet = false) {
  const child = Bun.spawn(command, {
    stdin: "inherit",
    stdout: quiet ? "ignore" : "inherit",
    stderr: quiet ? "ignore" : "inherit",
  });
  const stop = () => child.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    return await child.exited;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

if (!existsSync(binary)) {
  // Use the pinned npm bootstrap only to obtain its matching native CLI.
  // Its exit handler masks signals; never use it for the actual build.
  await run([process.execPath, join(sdk, "bin/electrobun.cjs"), "--help"]);
  if (!existsSync(binary)) throw new Error("Electrobun native CLI download failed");
}

if (process.platform === "darwin" && await run(["codesign", "--verify", binary], true) !== 0) {
  // The v1.18.1 release CLI has an invalid ad-hoc signature on recent macOS.
  // Re-sign only this project-local build tool; distribution signing is separate.
  console.log("Repairing Electrobun build tool's local ad-hoc signature");
  if (await run(["codesign", "--force", "--sign", "-", binary]) !== 0) {
    throw new Error("Could not repair the Electrobun native CLI signature");
  }
}

if (process.platform === "darwin") {
  const core = join(sdk, `dist-macos-${process.arch}`);
  if (!existsSync(join(core, "bun"))) {
    const { version } = await Bun.file(join(sdk, "package.json")).json() as { version: string };
    const response = await fetch(`https://github.com/blackboardsh/electrobun/releases/download/v${version}/electrobun-core-darwin-${process.arch}.tar.gz`);
    if (!response.ok) throw new Error(`Electrobun core download failed: ${response.status}`);
    mkdirSync(core, { recursive: true });
    await new Bun.Archive(await response.arrayBuffer()).extract(core);
  }
  // Core includes the Bun used to execute build hooks, so repair it before launch.
  for (const entry of readdirSync(core, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(core, entry.name);
    const probe = Bun.spawnSync(["file", "-b", path]);
    if (!probe.stdout.toString().includes("Mach-O")) continue;
    if (await run(["codesign", "--verify", path], true) !== 0 &&
        await run(["codesign", "--force", "--sign", "-", path]) !== 0) {
      throw new Error(`Could not repair Electrobun core signature: ${entry.name}`);
    }
  }
}

const status = await run([binary, ...process.argv.slice(2)]);
if (status !== 0) console.error(`Electrobun exited with status ${status}`);
process.exit(status);
