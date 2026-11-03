import praline from "@alexdrel/pralinejs/vite";

export default {
  plugins: [praline({ sources: "src", emit: "dts" })],
  build: { outDir: "build" },
};
