# Harbor Desktop

Electrobun **1.18.1** supplies native windows and bundles Bun. This pins the
Bun-native release line; Electrobun 2 uses the separate Hutch toolchain.
The existing Svelte UI, API, terminal, jobs, and database remain shared with
the CLI. Users do not need to install Bun for a packaged app.

From the repository root:

```sh
bun install --frozen-lockfile
bun run dev:desktop
bun run package:desktop
```

`bun run dev` (or `bun run dev:desktop`) starts the watched API, Vite, and desktop
together. The desktop window loads Vite for live UI updates; native main-process
changes require restarting the command. Packaged builds continue to use bundled UI.
Release outputs are in `apps/desktop/artifacts/`, app bundles in
`apps/desktop/build/`. Build on each target OS; macOS and Windows ARM64
service/terminal capabilities remain subject to the CLI's platform support.
macOS builds receive local ad-hoc signatures for testing. Configure Developer ID
signing/notarization before public distribution.

The desktop checks `<HARBOR_HOME>/harbor.lock` and attaches to its live daemon,
including an API-only daemon. Otherwise it launches the bundled compiled CLI.
Closing the app stops only that owned child; an independently installed daemon
continues running. Use the standalone CLI's `harbor service install` from a
stable installation path to enable a persistent launchd/systemd service.
The desktop never registers a service automatically. Existing `~/.harbor`
data and `HARBOR_HOME`, `HARBOR_DB_PATH`, `HARBOR_PORT` overrides are retained.

A loopback-only gateway serves bundled UI assets and forwards API responses,
SSE streams, and terminal WebSockets to the daemon. Requests from other web
origins are rejected. WebSocket frame/queue limits bound terminal buffering.

`backend.ts` and `gateway.ts` are strictly typechecked and tested. The small
native SDK bootstrap is JavaScript because Electrobun 1.18.1 ships TypeScript
source with upstream type errors under current Bun types; the config imports
the SDK config type directly. Native builds validate actual SDK imports.
The local build launcher verifies the downloaded macOS CLI and repairs its
invalid upstream ad-hoc signatures when necessary. Build hooks also ad-hoc sign
the app payload and installer wrapper. These local signatures do not replace
Developer ID distribution signing.
It also preserves native process failures that the upstream npm wrapper masks.

```sh
bun run --cwd apps/desktop typecheck
bun run --cwd apps/desktop test
```

Tests use disposable directories and local mock daemons; they do not touch
real Harbor data or register OS services.
