import { join } from "node:path";

// Local ad-hoc signing makes Bun's copied native executables runnable on macOS.
// Electrobun applies any configured Developer ID signing afterward.
if (process.platform === "darwin" && process.env.ELECTROBUN_OS === "macos") {
  const wrapper = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
  const dir = process.env.ELECTROBUN_BUILD_DIR;
  const name = process.env.ELECTROBUN_APP_NAME;
  if (!wrapper && (!dir || !name)) throw new Error("Missing Electrobun build-hook paths");
  const bundle = wrapper ?? join(dir!, name!.endsWith(".app") ? name! : `${name}.app`);
  const signed = Bun.spawnSync(["codesign", "--force", "--deep", "--sign", "-", bundle], {
    stdout: "inherit", stderr: "inherit",
  });
  if (signed.exitCode !== 0) throw new Error(`Could not ad-hoc sign ${bundle}`);
}
