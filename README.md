# Harbor

Harbor is a local-first control panel for AI coding agents, resources, workflows,
schedules, and terminals. Its API, CLI, MCP server, development tools, and desktop
main process run on **Bun**. The interface uses Svelte 5 and Vite.

This checkout already used Bun; there are no Deno runtime APIs, manifests, or lockfiles
to migrate. Electrobun adds a native desktop host while preserving the web interface
and the independently managed background service.

## Development

Install the Bun version pinned in `.bun-version`, then:

```sh
bun install --frozen-lockfile
bun run dev
```

The API listens on `http://localhost:11123`; Vite runs at
`http://localhost:11124` and proxies API and WebSocket requests. The development
supervisor stops both processes when either exits or receives a termination signal.

```sh
bun run typecheck
bun test
bun run package:cli
bun run build # complete desktop + CLI distribution
```

`package:cli` produces `dist/harbor` (`harbor.exe` on Windows) and its required
`dist/web-dist` sibling directory. Distribute them together. The compiled CLI
runs without installing Bun on the destination machine.

```sh
./dist/harbor serve --serve-ui --open
./dist/harbor serve
./dist/harbor mcp
```

The first command serves the built interface; the second runs API-only.

## Native desktop

[Electrobun 1.18.1](https://electrobun.dev/electrobun/) is pinned as the desktop layer: its Bun main process can run the existing native
server code, while its system webview displays Harbor's Svelte interface. Browser
API requests and terminal WebSockets continue using Harbor's local HTTP server.

```sh
bun run dev:desktop
bun run package:desktop
```

Desktop builds currently produce unsigned development/review artifacts. Packaging
checks the native launcher, bundled CLI, UI, and release artifacts before reporting
success, including when Electrobun exits after only bootstrapping its tools.

See [desktop development and lifecycle](apps/desktop/README.md) for desktop-specific
commands, build outputs, and daemon connection behavior. Desktop bundles include
a separate compiled Harbor CLI helper so background services can run independently
of the desktop window.

## Background service

The CLI supports a per-user launchd service on macOS and systemd service on Linux:

```sh
./dist/harbor service install
./dist/harbor service status
./dist/harbor service uninstall
```

Installation starts a persistent local service. Run these commands only when you
want to change the machine's service registration. Windows supports the CLI and
desktop app; Windows service registration is not implemented.

`HARBOR_HOME` defaults to `~/.harbor`, `HARBOR_PORT` to `11123`, and
`HARBOR_DB_PATH` to the home directory's `harbor.db`. The MCP client accepts
`HARBOR_URL`. Existing data stays in place; desktop adoption does not reset it.

## CI and releases

GitHub Actions installs from `bun.lock` with the pinned Bun version, runs typechecks
and tests, and packages compiled CLIs on macOS, Linux, and Windows. Desktop builds
run on native platform runners. Pushing a `v*` tag builds artifacts and creates
a draft GitHub release for review; signing and notarization require configuring platform credentials
before distributing trusted production installers. Linux requires the
[platform libraries documented by Electrobun](https://docs.electrobun.dev/electrobun/guides/cross-platform-development/).

## Cleanup

`bun run clean` removes compiler intermediates while keeping build outputs and
installers. `bun run clean --all` also removes generated CLI, web, and desktop
outputs. Dependencies and Harbor data are preserved.
