import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runServiceCommand, serviceArguments, serviceContext } from "./context";
import { renderPlist } from "./launchd";
import { renderUnit } from "./systemd";

const directory = mkdtempSync(join(tmpdir(), "harbor-service-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const source = { bunPath: "/opt/Bun Runtime/bun", cliEntry: "/src/Harbor App/index.ts", harborHome: "/home/Harbor Data" };
const compiled = { bunPath: "/opt/Harbor App/harbor", harborHome: "/home/Harbor Data" };

describe("service invocation", () => {
  test("source uses Bun and the CLI entry", () => {
    expect(serviceArguments(source)).toEqual([source.bunPath, source.cliEntry, "serve"]);
    expect(serviceContext().cliEntry).toEndWith("/packages/cli/src/index.ts");
  });

  test("compiled executable does not receive a virtual script path", async () => {
    const entry = join(directory, "probe.ts");
    const binary = join(directory, "harbor-probe");
    writeFileSync(entry, `import { serviceContext } from ${JSON.stringify(new URL("./context.ts", import.meta.url).pathname)}; console.log(JSON.stringify(serviceContext()));`);
    const build = Bun.spawn([process.execPath, "build", "--compile", entry, "--outfile", binary], { cwd: directory, stdout: "ignore", stderr: "pipe" });
    expect(await build.exited).toBe(0);
    const probe = Bun.spawn([binary], {
      cwd: directory,
      env: { ...process.env, HARBOR_DB_PATH: "relative-data/database.db" },
      stdout: "pipe", stderr: "pipe",
    });
    const result = JSON.parse(await new Response(probe.stdout).text());
    expect(await probe.exited).toBe(0);
    expect(result.cliEntry).toBeUndefined();
    expect(result.bunPath).toBe(realpathSync(binary));
    expect(result.dbPath).toBe(join(realpathSync(directory), "relative-data", "database.db"));
  });

  test("launchd emits valid arguments and escapes environment values", () => {
    const plist = renderPlist({ ...compiled, path: "/opt/bin:&tools", port: "12123", dbPath: "/data/Harbor & Work/harbor.db" });
    expect(plist).toContain("<string>/opt/Harbor App/harbor</string>\n    <string>serve</string>");
    expect(plist).not.toContain("index.ts");
    expect(plist).toContain("<string>/opt/bin:&amp;tools</string>");
    expect(plist).toContain("<string>12123</string>");
    expect(plist).toContain("<key>HARBOR_DB_PATH</key>\n    <string>/data/Harbor &amp; Work/harbor.db</string>");
  });

  test("systemd quotes source paths and preserves literal specifiers and dollars", () => {
    const unit = renderUnit({ ...source, harborHome: '/home/100%/$harbor', bunPath: '/opt/$BUN/100%/bun', path: "/opt/tools", dbPath: "/data/Harbor Work/100%/harbor.db" });
    expect(unit).toContain('ExecStart="/opt/$$BUN/100%%/bun" "/src/Harbor App/index.ts" "serve"');
    expect(unit).toContain('Environment="HARBOR_HOME=/home/100%%/$harbor"');
    expect(unit).toContain('Environment="PATH=/opt/tools"');
    expect(unit).toContain('Environment="HARBOR_DB_PATH=/data/Harbor Work/100%%/harbor.db"');
    expect(renderUnit(compiled)).toContain('ExecStart="/opt/Harbor App/harbor" "serve"');
  });

  test("failed service manager commands are reported", async () => {
    await expect(runServiceCommand([process.execPath, "-e", 'console.error("denied");process.exit(7)'])).rejects.toThrow("denied");
    expect(await runServiceCommand([process.execPath, "-e", "process.exit(7)"], false)).toBe(7);
  });
});
