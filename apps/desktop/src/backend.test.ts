import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectBackend } from "./backend";

const originalHome = process.env.HARBOR_HOME;
const originalPort = process.env.HARBOR_PORT;
const cleanup: Array<() => unknown | Promise<unknown>> = [];
afterEach(async () => {
  for (const stop of cleanup.splice(0).reverse()) await stop();
  if (originalHome === undefined) delete process.env.HARBOR_HOME;
  else process.env.HARBOR_HOME = originalHome;
  if (originalPort === undefined) delete process.env.HARBOR_PORT;
  else process.env.HARBOR_PORT = originalPort;
});
async function setup() {
  const home = await mkdtemp(join(tmpdir(), "harbor-backend-"));
  cleanup.push(() => rm(home, { recursive: true, force: true }));
  process.env.HARBOR_HOME = home;
  return home;
}

test("attaches API-only daemon without spawning or stopping it", async () => {
  const home = await setup();
  const daemon = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: () => Response.json({ ok: true, data: [] }),
  });
  cleanup.push(() => daemon.stop(true));
  await writeFile(join(home, "harbor.lock"), JSON.stringify({ pid: process.pid, port: daemon.port }));
  const connection = await connectBackend("/nonexistent-cli-must-not-be-started");
  expect(connection.url).toBe(`http://127.0.0.1:${daemon.port}`);
  await connection.stop();
  expect((await fetch(connection.url)).ok).toBe(true);
});

test.skipIf(process.platform === "win32")("starts and gracefully stops only its owned helper", async () => {
  const home = await setup();
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  process.env.HARBOR_PORT = String(reservation.port);
  reservation.stop(true);
  const helper = join(home, "helper");
  await writeFile(helper, `#!${process.execPath}
import { writeFileSync, unlinkSync } from 'node:fs';
const lock = process.env.HARBOR_HOME + '/harbor.lock';
const server = Bun.serve({hostname:'127.0.0.1',port:Number(process.env.HARBOR_PORT),fetch:()=>Response.json({ok:true,data:[]})});
writeFileSync(lock, JSON.stringify({pid:process.pid,port:server.port}));
process.on('SIGTERM',()=>{server.stop(true);unlinkSync(lock);process.exit(0)});
`);
  await chmod(helper, 0o755);
  const connection = await connectBackend(helper);
  cleanup.push(() => connection.stop());
  const lock = JSON.parse(await readFile(join(home, "harbor.lock"), "utf8")) as { pid: number };
  expect(lock.pid).not.toBe(process.pid);
  expect((await fetch(connection.url)).ok).toBe(true);
  await connection.stop();
  await connection.stop();
  expect(() => process.kill(lock.pid, 0)).toThrow();
});
