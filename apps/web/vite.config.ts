import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  server: {
    port: 11124,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.HARBOR_PORT ?? 11123}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `http://127.0.0.1:${process.env.HARBOR_PORT ?? 11123}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
