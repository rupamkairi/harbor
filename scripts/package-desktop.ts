import { rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const desktop = join(root, "apps/desktop");
const outputs = [join(desktop, "build"), join(desktop, "artifacts")];

async function run(script: string, cwd: string): Promise<void> {
  const processHandle = Bun.spawn([process.execPath, "run", script], {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await processHandle.exited;
  if (code !== 0) throw new Error(`${script} failed (${code})`);
}

async function requireOutput(pattern: string, cwd: string): Promise<string> {
  if (!(await stat(cwd).catch(() => null))?.isDirectory()) {
    throw new Error(`Desktop packaging exited without creating ${cwd}. Electrobun's native tool bootstrap did not complete the build.`);
  }
  for await (const path of new Bun.Glob(pattern).scan({ cwd, absolute: true })) {
    const info = await stat(path);
    if (info.isFile() && info.size > 0) return path;
  }
  throw new Error(`Desktop packaging did not produce ${pattern} in ${cwd}. Electrobun may have bootstrapped its native tools without completing the build; retry after checking the tool download.`);
}

export async function verifyDesktopPackage(): Promise<void> {
  const build = outputs[0]!;
  await requireOutput("**/launcher{,.exe}", build);
  const required = ["harbor-cli", "web-dist/index.html", "bun/index.js"];
  const direct = new Set<string>();
  for await (const path of new Bun.Glob("**/*").scan({ cwd: build })) {
    direct.add(path.replaceAll("\\", "/"));
  }
  const containsResources = (entries: Set<string>): boolean => required.every((suffix) =>
    [...entries].some((entry) => entry.endsWith(`/${suffix}`) ||
      (suffix === "harbor-cli" && entry.endsWith("/harbor-cli.exe"))),
  );
  if (!containsResources(direct)) {
    // Stable macOS bundles replace their app resources with a self-extracting
    // zstd payload. Inspect that payload rather than requiring extracted files.
    const payload = await requireOutput("**/Resources/*.tar.zst", build);
    const tar = Bun.spawn(["tar", "-tf", payload], { stdout: "pipe", stderr: "pipe" });
    const [listing, errors, code] = await Promise.all([
      new Response(tar.stdout).text(), new Response(tar.stderr).text(), tar.exited,
    ]);
    if (code !== 0) throw new Error(`Could not verify desktop payload: ${errors}`);
    if (!containsResources(new Set(listing.replaceAll("\\", "/").split(/\r?\n/)))) {
      throw new Error("Desktop payload is missing its CLI helper, web UI, or Bun main script.");
    }
  }
  await requireOutput("*-update.json", outputs[1]!);
  await requireOutput("*.{dmg,exe,zst,tar.gz,AppImage}", outputs[1]!);
  console.log("Verified native desktop launcher, CLI helper, web UI, and release artifacts.");
}

if (import.meta.main) {
  await run("package:cli", root);
  // Reject stale successful builds when a bootstrap command exits without building.
  for (const output of outputs) await rm(output, { recursive: true, force: true });
  await run("build", desktop);
  await verifyDesktopPackage();
}
