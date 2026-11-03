import { resolve } from "node:path";
import { defineConfig } from "vite";
import { appPlugin, toposPlugin } from "./topos-vite.ts";
import praline from "@alexdrel/pralinejs/vite";

const projectRoot = import.meta.dirname;

export default defineConfig({
  root: projectRoot,
  plugins: [praline({ sources: "editor", emit: "dts" }), toposPlugin(), appPlugin()],
  resolve: {
    alias: {
      "#topos": resolve(projectRoot, "../../topos"),
    },
  },
  server: {
    host: "::",
    fs: {
      allow: [projectRoot, resolve(projectRoot, ".."), resolve(projectRoot, "../../topos")],
    },
    watch: { ignored: ["**/src/enamel/compendium/compendium.topos"] },
  },
  build: {
    outDir: "build",
    rolldownOptions: {
      output: { chunkFileNames: "assets/topos-shared-[hash].js" },
      input: {
        editor: resolve(import.meta.dirname, "editor.html"),
        slate: resolve(import.meta.dirname, "slate.html"),
      },
    },
  },
});
