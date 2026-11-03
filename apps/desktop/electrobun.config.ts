import type { ElectrobunConfig } from "./node_modules/electrobun/dist/api/bun/ElectrobunConfig";

export default {
  app: {
    name: "Harbor",
    identifier: "dev.harbor.desktop",
    version: "0.1.0",
  },
  build: {
    useAsar: false,
    bun: { entrypoint: "src/index.js" },
    copy: {
      [process.platform === "win32" ? "../../dist/harbor.exe" : "../../dist/harbor"]:
        process.platform === "win32" ? "harbor-cli.exe" : "harbor-cli",
      "../web/dist": "web-dist",
    },
    mac: { codesign: false, notarize: false },
    targets: "current",
  },
  scripts: {
    postBuild: "scripts/sign-bundle.ts",
    postWrap: "scripts/sign-bundle.ts",
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
