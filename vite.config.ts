import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };
import { buildManifest } from "./manifest.ts";

const manifest = (): Plugin => ({
  name: "manifest",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "manifest.json",
      source: JSON.stringify(buildManifest(pkg), null, 2),
    });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), manifest()],
  build: {
    outDir: "build",
    sourcemap: false,
    rolldownOptions: {
      input: {
        main: "./index.html",
        devtools: "./devtools.html",
      },
    },
  },
});
