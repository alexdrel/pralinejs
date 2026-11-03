#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { relative } from "node:path";
import { parseHtml, validate, emitModule } from "../compiler/index.ts";
import { writeOutput } from "../files/output.ts";
import { discoverInputs } from "../files/inputs.ts";
import packageJson from "../../package.json" with { type: "json" };

const help = `Usage: praline [options] <file.html | directory | "glob"> [...]

Compile HTML blueprints. Directories are searched recursively; quote globs for
portable expansion. Overlapping inputs are deduplicated and processed in order.

Options:
  --emit none|js|ts|dts          Output format (default: ts)
  --types import|embed          Type dependencies (default: import)
  --update content|source       Update policy (default: content)
  --exclude <pattern>           Exclude names anywhere, or paths relative to cwd; repeatable
  --clean                       Remove other generated formats after success
  --log-level verbose|info|error Output detail (default: verbose)
  --preserve-whitespace         Preserve all text whitespace
  --preserve-whitespace-tag tag Preserve an additional tag; repeatable
  --help, -h                    Show this help
  --version, -v                 Show the package version

Discovery skips dot directories and node_modules; explicit paths are allowed.
Generated output is adjacent to each HTML source.
Verbose shows file statuses and totals; info shows totals; error shows errors only.

Examples:
  praline panel.html --emit dts
  praline src/components --exclude "**/pages/**"
  praline "src/**/*.html" --types embed
`;

if (import.meta.main) {
  try {
    const { values, positionals: inputs } = parseArgs({
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        exclude: { type: "string", multiple: true },
        emit: { type: "string", default: "ts" },
        update: { type: "string", default: "content" },
        types: { type: "string", default: "import" },
        clean: { type: "boolean" },
        "log-level": { type: "string", default: "verbose" },
        "preserve-whitespace": { type: "boolean" },
        "preserve-whitespace-tag": { type: "string", multiple: true },
      },
      allowPositionals: true,
    });
    if (values.help) {
      console.log(help);
      process.exit(0);
    }
    if (values.version) {
      console.log(packageJson.version);
      process.exit(0);
    }
    const format = values.emit;
    const update = values.update;
    const types = values.types;
    const logLevel = values["log-level"];
    if (logLevel !== "verbose" && logLevel !== "info" && logLevel !== "error") throw new Error(`Unknown log level: ${logLevel}`);
    if (types !== "embed" && types !== "import") throw new Error(`Unknown type mode: ${types}`);
    if (update !== "content" && update !== "source") throw new Error(`Unknown update mode: ${update}`);
    if (format !== "none" && format !== "ts" && format !== "js" && format !== "dts") throw new Error(`Unknown output format: ${format}`);
    if (!inputs.length) throw new Error(help);
    const { files, errors } = await discoverInputs(inputs, values.exclude);
    let updated = 0;
    let failed = errors.length;
    for (const error of errors) {
      console.error(error);
      process.exitCode = 1;
    }
    for (const input of files) {
      try {
        const source = await readFile(input, "utf8");
        const module = parseHtml(source, {
          preserveWhitespace: values["preserve-whitespace"] || values["preserve-whitespace-tag"],
        });
        validate(module);
        const { output, written } = await writeOutput(input, format, emitModule(module, format, { types }), source, { clean: values.clean, update });
        if (written) updated++;
        if (logLevel === "verbose") {
          const path = relative(process.cwd(), output ?? input);
          console.log(`${path} ${format === "none" ? "valid" : written ? "updated" : "up to date"}`);
        }
      } catch (error) {
        console.error(`${relative(process.cwd(), input)}: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
        failed++;
      }
    }
    if (logLevel !== "error") console.log(`${files.length} file${files.length === 1 ? "" : "s"} checked, ${updated} updated, ${failed} failed.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
