import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2024",
    minify: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/lib/index.ts"),
      formats: ["es"],
      fileName: "lib",
    },
  },
});
