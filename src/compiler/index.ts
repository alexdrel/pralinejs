import { HtmlParser, type CompileOptions } from "./html.ts";
import { emitJs } from "./emit-js.ts";
import { emitTs } from "./emit-ts.ts";
import { type HtmlModule } from "./model.ts";
import { validate } from "./validate.ts";
import { type EmitOptions } from "./types.ts";

export { validate, type CompileOptions };
export { type HtmlModule, type Blueprint } from "./model.ts";
export type { EmitOptions, TypeMode } from "./types.ts";

export type EmitFormat = "none" | "ts" | "js" | "dts";

/** Parse HTML into a model, retaining occurrences for semantic validation. */
export function parseHtml(source: string, options: CompileOptions = {}): HtmlModule {
  return new HtmlParser(source).parse(options);
}

/** Emit the same public blueprint contract using the selected output strategy. */
export function emitModule(module: HtmlModule, format: EmitFormat = "ts", options: EmitOptions = {}): string {
  if (format === "none") return "";
  return format === "js" ? emitJs(module) : emitTs(module, format, options.types);
}

/** Compile an HTML fragment to JSONML data and native DOM reference types. */
export function compileHtml(source: string, format: EmitFormat = "ts", options: CompileOptions & EmitOptions = {}): string {
  const module = parseHtml(source, options);
  validate(module);
  return emitModule(module, format, options);
}
