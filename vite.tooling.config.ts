import { resolve } from "node:path";
import { defineConfig } from "vite";
import packageJson from "./package.json" with { type: "json" };

const externalPackages = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.peerDependencies)];

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "es2024",
    minify: false,
    lib: {
      entry: {
        compiler: resolve(import.meta.dirname, "src/compiler/index.ts"),
        vite: resolve(import.meta.dirname, "src/vite/index.ts"),
        cli: resolve(import.meta.dirname, "src/cli/praline.ts"),
      },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
    rolldownOptions: {
      external(id) {
        return id.startsWith("node:") || externalPackages.some((name) => id === name || id.startsWith(`${name}/`));
      },
      output: {
        chunkFileNames: "[name].js",
        codeSplitting: {
          groups: [{ name: "tooling", minShareCount: 2 }],
        },
      },
    },
  },
});
