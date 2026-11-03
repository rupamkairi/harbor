import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startGateway } from "./gateway";

const cleanup: Array<() => unknown | Promise<unknown>> = [];
afterEach(async () => { for (const stop of cleanup.splice(0).reverse()) await stop(); });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "harbor-gateway-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "index.html"), "<html>Harbor</html>");
  const backend = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request, server) {
      if (new URL(request.url).pathname === "/ws/terminal") {
        if (server.upgrade(request)) return;
      }
      return new Response(request.body ?? "data: hello\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
    websocket: {
      open(socket) { socket.send("initial"); },
      message(socket, message) { socket.send(message); },
    },
  });
  cleanup.push(() => backend.stop(true));
  const gateway = startGateway(root, backend.url.toString());
  cleanup.push(() => gateway.stop());
  return gateway;
}

test("serves root and SPA routes; proxies streaming API and request body", async () => {
  const gateway = await setup();
  expect(await (await fetch(gateway.url)).text()).toBe("<html>Harbor</html>");
  expect(await (await fetch(new URL("/jobs/a", gateway.url))).text()).toBe("<html>Harbor</html>");
  const events = await fetch(new URL("/api/v1/events", gateway.url));
  expect(events.headers.get("content-type")).toBe("text/event-stream");
  expect(await events.text()).toBe("data: hello\n\n");
  const response = await fetch(new URL("/api/v1/test", gateway.url), { method: "POST", body: "input" });
  expect(await response.text()).toBe("input");
});

test("rejects foreign origins and malformed/traversing asset paths", async () => {
  const gateway = await setup();
  expect((await fetch(gateway.url, { headers: { Origin: "https://example.com" } })).status).toBe(403);
  expect((await fetch(new URL("/%ZZ", gateway.url))).status).toBe(400);
  expect((await fetch(new URL("/..%2foutside", gateway.url))).status).toBe(403);
});

test("terminal forwards immediate upstream greeting, early input and binary frames", async () => {
  const gateway = await setup();
  const url = new URL("/ws/terminal?sessionId=one", gateway.url);
  url.protocol = "ws:";
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url);
    cleanup.push(() => socket.close());
    const timer = setTimeout(() => reject(new Error("WebSocket proxy timed out")), 3_000);
    const messages: Array<string | number[]> = [];
    socket.binaryType = "arraybuffer";
    socket.onopen = () => { socket.send("early"); socket.send(new Uint8Array([1, 2, 3])); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error("WebSocket failed")); };
    socket.onmessage = (event) => {
      messages.push(typeof event.data === "string" ? event.data : Array.from(new Uint8Array(event.data)));
      if (messages.length === 3) {
        clearTimeout(timer);
        expect(messages).toEqual(["initial", "early", [1, 2, 3]]);
        socket.close();
        resolve();
      }
    };
  });
});
