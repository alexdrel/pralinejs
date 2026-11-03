import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build, normalizePath, type HmrContext, type ModuleNode, type ResolvedConfig, type ViteDevServer } from "vite";
import praline from "./index.ts";

const context = {
  meta: { viteVersion: "test", rolldownVersion: "test", rollupVersion: "test", watchMode: true },
  error(error: unknown): never {
    throw error;
  },
  info() {},
  warn() {},
  debug() {},
};

test("source update mode preserves edited declarations while virtual JS still uses current compiler options", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-vite-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "panel.html"), "<p>One   two</p>");
  await writeFile(join(root, "main.js"), 'export { default } from "./panel.html.js";');
  const run = (preserveWhitespace: boolean) =>
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [praline({ sources: "panel.html", emit: "dts", update: "source", preserveWhitespace })],
      build: { write: false, minify: false, lib: { entry: join(root, "main.js"), formats: ["es"], fileName: "main" } },
    });
  await run(false);
  const output = join(root, "panel.html.d.ts");
  const edited = (await readFile(output, "utf8")) + "\n// User edit\n";
  await writeFile(output, edited);
  const result = await run(true);
  assert.equal(await readFile(output, "utf8"), edited);
  const bundle = Array.isArray(result) ? result[0] : result;
  assert.ok("output" in bundle);
  const chunk = bundle.output.find((item) => item.type === "chunk");
  assert.ok(chunk?.type === "chunk");
  const module = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
  assert.deepEqual(module.default, [["p", {}, "One   two"]]);
});

test("default emit none compiles selected imports on demand without writing or validating unused HTML", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-vite-memory-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "components"));
  await writeFile(join(root, "components/panel.html"), "<button>Go</button>");
  await writeFile(join(root, "components/unused.html"), '<div id="one" id="two"></div>');
  await writeFile(join(root, "main.js"), 'export { default } from "./components/panel.html.js";');
  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [praline({ sources: "components" })],
    build: { write: false, minify: false, lib: { entry: join(root, "main.js"), formats: ["es"], fileName: "main" } },
  });
  const bundles = Array.isArray(result) ? result : [result];
  const chunk = bundles.flatMap((bundle) => ("output" in bundle ? bundle.output : [])).find((item) => item.type === "chunk");
  assert.ok(chunk?.type === "chunk");
  const module = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
  assert.deepEqual(module.default, [["button", {}, "Go"]]);
  assert.deepEqual((await readdir(root)).sort(), ["components", "main.js"]);
  assert.deepEqual((await readdir(join(root, "components"))).sort(), ["panel.html", "unused.html"]);
});

test("durable output generates unimported components and passes options through without affecting raw imports", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-vite-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "components"));
  const html = '<div><template ref="{{menu.item}}"><b>{{label}}</b></template></div>';
  await writeFile(join(root, "components/panel.html"), html);
  await writeFile(join(root, "components/unused.html"), '<textarea ref="{{input}}"></textarea>');
  await writeFile(join(root, "components/unused.html.ts"), "old generated output");
  await writeFile(
    join(root, "main.js"),
    'export { default as template, menu } from "./components/panel.html.js"; export { default as raw } from "./components/panel.html?raw";',
  );
  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [praline({ sources: "components", emit: "dts", types: "embed", clean: true })],
    build: { write: false, minify: false, lib: { entry: join(root, "main.js"), formats: ["es"], fileName: "main" } },
  });
  const bundles = Array.isArray(result) ? result : [result];
  const chunk = bundles.flatMap((bundle) => ("output" in bundle ? bundle.output : [])).find((item) => item.type === "chunk");
  assert.ok(chunk?.type === "chunk");
  const module = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
  assert.equal(module.raw, html);
  assert.equal(module.template[0][2][2], module.menu.item[0]);
  assert.match(await readFile(join(root, "components/panel.html.d.ts"), "utf8"), /export namespace menu/);
  assert.match(await readFile(join(root, "components/panel.html.d.ts"), "utf8"), /type Blueprint</);
  assert.match(await readFile(join(root, "components/unused.html.d.ts"), "utf8"), /input: HtmlElement<"textarea">/);
  await assert.rejects(readFile(join(root, "components/unused.html.ts"), "utf8"), { code: "ENOENT" });
});

test("ordinary HTML and query imports are left to Vite", async () => {
  const plugin = praline({ sources: "*.html" });
  const resolveId = plugin.resolveId;
  assert.ok(typeof resolveId === "function");
  for (const source of ["./panel.html", "./panel.html?raw", "./panel.html?praline"]) {
    assert.equal(await resolveId.call(context as unknown as ThisParameterType<typeof resolveId>, source, "/main.ts", { isEntry: false }), undefined);
  }
});

test("source selection and exclusions leave other HTML-generated modules to Vite", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-vite-selection-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "components"));
  await writeFile(join(root, "components/owned.html"), "<b>Current HTML</b>");
  await writeFile(join(root, "components/owned.html.js"), 'export default "stale generated JS";');
  await writeFile(join(root, "components/foreign.html"), '<p id="a" id="b"></p>');
  await writeFile(join(root, "components/foreign.html.js"), 'export default "another generator";');
  await writeFile(join(root, "outside.html"), '<p id="a" id="b"></p>');
  await writeFile(join(root, "outside.html.js"), 'export default "outside selection";');
  await writeFile(
    join(root, "main.js"),
    'export { default as owned } from "./components/owned.html.js"; export { default as foreign } from "./components/foreign.html.js"; export { default as outside } from "./outside.html.js";',
  );
  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [praline({ sources: ["components", "components/*.html"], exclude: ["**/foreign.html"], emit: "dts" })],
    build: { write: false, lib: { entry: join(root, "main.js"), formats: ["es"], fileName: "main" } },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  assert.ok("output" in bundle);
  const chunk = bundle.output.find((item) => item.type === "chunk");
  assert.ok(chunk?.type === "chunk");
  const module = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
  assert.deepEqual(module.owned, [["b", {}, "Current HTML"]]);
  assert.equal(module.foreign, "another generator");
  assert.equal(module.outside, "outside selection");
  assert.deepEqual((await readdir(join(root, "components"))).sort(), ["foreign.html", "foreign.html.js", "owned.html", "owned.html.d.ts", "owned.html.js"]);
});

test("eager generation processes valid sources before reporting selection and compilation failures", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-vite-errors-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "bad.html"), '<p id="a" id="b"></p>');
  await writeFile(join(root, "good.html"), "<p>Good</p>");
  const plugin = praline({ sources: ["missing.html", "*.html"], emit: "dts" });
  assert.ok(typeof plugin.configResolved === "function");
  plugin.configResolved.call(context, { root } as ResolvedConfig);
  const start = plugin.buildStart;
  assert.ok(typeof start === "function");
  await assert.rejects(
    async () => start.call(context as unknown as ThisParameterType<typeof start>, {} as Parameters<typeof start>[0]),
    (error: Error) => {
      assert.match(error.message, /missing\.html: No HTML inputs matched/);
      assert.match(error.message, /bad\.html: HTML 1:/);
      return true;
    },
  );
  assert.match(await readFile(join(root, "good.html.d.ts"), "utf8"), /declare const __praline/);
});

test("file-free mode discovers additions for imports and invalidates them without writing output", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-vite-memory-watch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "initial.html"), "<p>Initial</p>");
  const plugin = praline({ sources: "." });
  assert.ok(typeof plugin.configResolved === "function");
  plugin.configResolved.call(context, { root } as ResolvedConfig);
  assert.ok(typeof plugin.buildStart === "function");
  await plugin.buildStart.call(context as unknown as ThisParameterType<typeof plugin.buildStart>, {} as Parameters<typeof plugin.buildStart>[0]);
  const watcher = new EventEmitter();
  const module = {} as ModuleNode;
  const server = { watcher, moduleGraph: { getModuleById: () => module } } as unknown as ViteDevServer;
  assert.ok(typeof plugin.configureServer === "function");
  plugin.configureServer.call(context, server);
  const file = normalizePath(join(root, "new.html"));
  const source = "<p>Added</p>";
  await writeFile(file, source);
  await watcher.listeners("add")[0](file);
  const resolveId = plugin.resolveId;
  assert.ok(typeof resolveId === "function");
  const resolver = { ...context, resolve: async () => ({ id: file }) };
  assert.equal(
    await resolveId.call(resolver as unknown as ThisParameterType<typeof resolveId>, "./new.html.js", join(root, "main.js"), { isEntry: false }),
    `\0praline:${file}.js`,
  );
  assert.ok(typeof plugin.handleHotUpdate === "function");
  assert.deepEqual(await plugin.handleHotUpdate.call(context, { file, modules: [], server, read: async () => source } as unknown as HmrContext), [module]);
  assert.deepEqual((await readdir(root)).sort(), ["initial.html", "new.html"]);
  assert.ok(typeof plugin.closeBundle === "function");
  plugin.closeBundle.call(context as unknown as ThisParameterType<typeof plugin.closeBundle>);
  assert.equal(watcher.listenerCount("add"), 0);
});

test("HTML edits update declarations and invalidate the virtual module", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-hmr-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = normalizePath(join(root, "panel.html"));
  const plugin = praline({ sources: "*.html", emit: "dts" });
  await writeFile(file, '<input ref="{{input}}">');
  assert.ok(typeof plugin.configResolved === "function");
  plugin.configResolved.call(context, { root } as ResolvedConfig);
  assert.ok(typeof plugin.buildStart === "function");
  await plugin.buildStart.call(context as unknown as ThisParameterType<typeof plugin.buildStart>, {} as Parameters<typeof plugin.buildStart>[0]);
  const module = {} as ModuleNode;
  const server = {
    moduleGraph: {
      getModuleById(id: string) {
        assert.equal(id, `\0praline:${file}.js`);
        return module;
      },
    },
  } as unknown as ViteDevServer;
  const hotUpdate = plugin.handleHotUpdate;
  assert.ok(typeof hotUpdate === "function");
  const update = async (source: string) => {
    await writeFile(file, source);
    return hotUpdate.call(context, {
      file,
      modules: [],
      server,
      read: async () => source,
    } as unknown as HmrContext);
  };
  assert.deepEqual(await update('<input ref="{{input}}">'), [module]);
  assert.match(await readFile(`${file}.d.ts`, "utf8"), /input: HtmlElement<"input">/);
  assert.deepEqual(await update('<textarea ref="{{input}}"></textarea>'), [module]);
  assert.match(await readFile(`${file}.d.ts`, "utf8"), /input: HtmlElement<"textarea">/);
});

test("invalid edits preserve previous declarations and a later valid edit recovers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-hmr-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = normalizePath(join(root, "panel.html"));
  const plugin = praline({ sources: "*.html", emit: "dts" });
  await writeFile(file, '<input ref="{{input}}">');
  assert.ok(typeof plugin.configResolved === "function");
  plugin.configResolved.call(context, { root } as ResolvedConfig);
  assert.ok(typeof plugin.buildStart === "function");
  await plugin.buildStart.call(context as unknown as ThisParameterType<typeof plugin.buildStart>, {} as Parameters<typeof plugin.buildStart>[0]);
  const hotUpdate = plugin.handleHotUpdate;
  assert.ok(typeof hotUpdate === "function");
  const server = { moduleGraph: { getModuleById: () => undefined } } as unknown as ViteDevServer;
  const update = async (source: string) => hotUpdate.call(context, { file, modules: [], server, read: async () => source } as unknown as HmrContext);
  await update('<input ref="{{input}}">');
  const previous = await readFile(`${file}.d.ts`, "utf8");
  await assert.rejects(update('<input id="one" id="two">'), /panel\.html: HTML 1:\d+: duplicate-attribute/);
  assert.equal(await readFile(`${file}.d.ts`, "utf8"), previous);
  await update('<textarea ref="{{input}}"></textarea>');
  assert.match(await readFile(`${file}.d.ts`, "utf8"), /input: HtmlElement<"textarea">/);
});

test("watcher additions and deletions maintain declarations, and closing removes listeners", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-watcher-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plugin = praline({ sources: "*.html", emit: "dts" });
  assert.ok(typeof plugin.configResolved === "function");
  plugin.configResolved.call(context, { root } as ResolvedConfig);
  const watcher = new EventEmitter();
  const server = { watcher } as unknown as ViteDevServer;
  assert.ok(typeof plugin.configureServer === "function");
  plugin.configureServer.call(context, server);
  assert.equal(watcher.listenerCount("add"), 1);
  assert.equal(watcher.listenerCount("unlink"), 1);
  const added = normalizePath(join(root, "new.html"));
  await writeFile(added, '<span ref="{{label}}"></span>');
  await watcher.listeners("add")[0](added);
  assert.match(await readFile(`${added}.d.ts`, "utf8"), /label: HtmlElement<"span">/);
  await rm(added);
  await watcher.listeners("unlink")[0](added);
  await assert.rejects(readFile(`${added}.d.ts`, "utf8"), { code: "ENOENT" });
  assert.ok(typeof plugin.closeBundle === "function");
  plugin.closeBundle.call(context as unknown as ThisParameterType<typeof plugin.closeBundle>);
  assert.equal(watcher.listenerCount("add"), 0);
  assert.equal(watcher.listenerCount("unlink"), 0);
});
