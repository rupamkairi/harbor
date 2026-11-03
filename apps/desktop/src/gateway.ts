import { isAbsolute, relative, resolve, sep } from "node:path";
import { stat } from "node:fs/promises";
import type { ServerWebSocket } from "bun";

type Bridge = {
  target: string;
  upstream?: WebSocket;
  pending: Array<string | Uint8Array>;
  pendingBytes: number;
};

/** Same-origin UI/API gateway, including streaming responses and terminal sockets. */
export function startGateway(webRoot: string, backend: string) {
  const root = resolve(webRoot);
  const sockets = new Set<ServerWebSocket<Bridge>>();
  const server = Bun.serve<Bridge>({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, server) {
      const url = new URL(request.url);
      const origin = request.headers.get("origin");
      if (url.host !== server.url.host || (origin && origin !== server.url.origin)) {
        return new Response("Forbidden", { status: 403 });
      }
      if (url.pathname === "/ws/terminal") {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
          return new Response("WebSocket required", { status: 426 });
        }
        const target = new URL(url.pathname + url.search, backend);
        target.protocol = "ws:";
        if (server.upgrade(request, { data: { target: target.toString(), pending: [], pendingBytes: 0 } })) return;
        return new Response("Upgrade failed", { status: 400 });
      }
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        try {
          const target = new URL(url.pathname + url.search, backend);
          const headers = new Headers(request.headers);
          headers.delete("host");
          headers.delete("origin");
          return await fetch(target, {
            method: request.method,
            headers,
            body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
            signal: request.signal,
            redirect: "manual",
          });
        } catch {
          return new Response("Harbor backend is unavailable", { status: 502 });
        }
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405 });
      }
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return new Response("Invalid path", { status: 400 });
      }
      const filePath = resolve(root, `.${pathname}`);
      const rel = relative(root, filePath);
      if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) {
        return new Response("Forbidden", { status: 403 });
      }
      const file = Bun.file(filePath);
      if (await stat(filePath).then((info) => info.isFile()).catch(() => false)) return new Response(request.method === "HEAD" ? null : file, {
        headers: { "Content-Type": file.type },
      });
      const index = Bun.file(resolve(root, "index.html"));
      return new Response(request.method === "HEAD" ? null : index, {
        headers: { "Content-Type": "text/html" },
      });
    },
    websocket: {
      maxPayloadLength: 64 * 1024,
      backpressureLimit: 1024 * 1024,
      closeOnBackpressureLimit: true,
      open(socket) {
        sockets.add(socket);
        const { pending } = socket.data;
        const upstream = new WebSocket(socket.data.target);
        socket.data.upstream = upstream;
        upstream.binaryType = "arraybuffer";
        upstream.onopen = () => {
          for (const message of pending) upstream.send(message);
          pending.length = 0;
          socket.data.pendingBytes = 0;
        };
        upstream.onmessage = (event) => {
          const sent = socket.send(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
          if (sent === 0 || socket.getBufferedAmount() > 1024 * 1024) {
            socket.close(1013, "Terminal client is too slow");
            upstream.close();
          }
        };
        upstream.onclose = () => socket.close();
        upstream.onerror = () => socket.close(1011, "Backend connection failed");
        if (upstream.readyState === WebSocket.CLOSED) socket.close(1011, "Backend unavailable");
      },
      message(socket, message) {
        if (socket.data.upstream?.readyState === WebSocket.OPEN) socket.data.upstream.send(message);
        else if (socket.data.upstream?.readyState === WebSocket.CONNECTING) {
          // Terminal input during connection is small; cap pending frames.
          if (socket.data.pendingBytes + (typeof message === "string" ? Buffer.byteLength(message) : message.byteLength) > 64 * 1024) socket.close(1009, "Too much pending input");
          else {
            socket.data.pendingBytes += typeof message === "string" ? Buffer.byteLength(message) : message.byteLength;
            socket.data.pending.push(typeof message === "string" ? message : new Uint8Array(message));
          }
        }
      },
      close(socket) {
        sockets.delete(socket);
        socket.data.upstream?.close();
      },
    },
  });
  return {
    url: server.url.toString(),
    stop() {
      for (const socket of sockets) {
        socket.data.upstream?.close();
        socket.close();
      }
      server.stop(true);
    },
  };
}
