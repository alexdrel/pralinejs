import { readFile, rm } from "node:fs/promises";
import { normalizePath, type Plugin, type ViteDevServer } from "vite";
import { parseHtml, validate, emitModule, type CompileOptions, type EmitFormat, type EmitOptions } from "../compiler/index.ts";
import { writeOutput, type UpdateMode } from "../files/output.ts";
import { discoverInputs } from "../files/inputs.ts";

export interface PralineOptions extends CompileOptions, EmitOptions {
  /** HTML files, directories, or globs, relative to Vite's root. */
  sources: string | readonly string[];
  /** Exclusion patterns, relative to Vite's root, using the CLI discovery rules. */
  exclude?: readonly string[];
  /** Durable adjacent output; virtual JavaScript is always supplied. Default: none. */
  emit?: EmitFormat;
  /** Remove other known output formats after successful compilation. Default: false. */
  clean?: boolean;
  /** Update by generated content (default), or only when the HTML source changes. */
  update?: UpdateMode;
}

const prefix = "\0praline:";
const moduleId = (file: string) => `${prefix}${file}.js`;

/** Compile virtual .html.js imports; optionally maintain adjacent generated modules. */
export default function praline({
  sources,
  exclude = [],
  emit = "none",
  clean = false,
  update = "content",
  preserveWhitespace,
  types = "import",
}: PralineOptions): Plugin {
  let root: string;
  const inputs = typeof sources === "string" ? [sources] : sources;
  let selected = new Set<string>();
  const generated = new Map<string, string>();
  let server: ViteDevServer | undefined;

  async function discover() {
    const result = await discoverInputs(inputs, exclude, root);
    selected = new Set(result.files.map(normalizePath));
    return result.errors;
  }

  async function compile(file: string, source?: string) {
    try {
      source ??= await readFile(file, "utf8");
      const module = parseHtml(source, { preserveWhitespace });
      validate(module);
      const code = emitModule(module, "js");
      const { output } = await writeOutput(file, emit, emit === "js" ? code : emitModule(module, emit, { types }), source, { clean, update });
      if (output) generated.set(file, output);
      return code;
    } catch (error) {
      throw new Error(`${file}: ${error instanceof Error ? error.message : error}`, { cause: error });
    }
  }

  async function added(file: string) {
    file = normalizePath(file);
    if (!file.endsWith(".html")) return;
    try {
      for (const error of await discover()) server!.config.logger.error(error);
      if (selected.has(file) && (emit !== "none" || clean)) await compile(file);
    } catch (error) {
      server!.config.logger.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function removed(file: string) {
    file = normalizePath(file);
    selected.delete(file);
    const output = generated.get(file);
    if (!output) return;
    generated.delete(file);
    await rm(output, { force: true });
  }

  return {
    name: "praline",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    async buildStart() {
      const errors = await discover();
      if (emit !== "none" || clean) {
        for (const file of selected) {
          try {
            await compile(file);
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
      }
      if (errors.length) this.error(new Error(errors.join("\n")));
    },
    async resolveId(source, importer, options) {
      if (!importer || options.isEntry || !source.endsWith(".html.js")) return;
      const resolved = await this.resolve(source.slice(0, -3), importer, { skipSelf: true });
      if (resolved && selected.has(normalizePath(resolved.id))) return moduleId(normalizePath(resolved.id));
    },
    async load(id) {
      if (!id.startsWith(prefix)) return;
      const file = id.slice(prefix.length, -3);
      this.addWatchFile(file);
      try {
        return await compile(file);
      } catch (error) {
        this.error({ id: file, message: error instanceof Error ? error.message : String(error) });
      }
    },
    configureServer(instance) {
      server = instance;
      server.watcher.on("add", added);
      server.watcher.on("unlink", removed);
    },
    async handleHotUpdate(context) {
      const file = normalizePath(context.file);
      if (!selected.has(file)) return;
      const module = context.server.moduleGraph.getModuleById(moduleId(file));
      if (emit === "none" && !clean && !module) return;
      await compile(file, await context.read());
      if (module) return [...new Set([...context.modules, module])];
    },
    closeBundle() {
      server?.watcher.off("add", added);
      server?.watcher.off("unlink", removed);
    },
  };
}
