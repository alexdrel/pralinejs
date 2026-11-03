# Praline tooling

The CLI and Vite plugin convert HTML to JsonML arrays and infer types for its references and parameters. Both use the same conversion and file-selection rules. The CLI writes adjacent modules or declarations; Vite makes the arrays available through imports and can maintain declarations for editor support.

```sh
npm install @alexdrel/pralinejs
```

Tooling requires Node.js 26 or later. The browser runtime is a separate entrypoint and does not load the compiler, Vite, or Node modules.

## Vite

Select the HTML components Praline owns:

```ts
import { defineConfig } from "vite";
import praline from "@alexdrel/pralinejs/vite";

export default defineConfig({
  plugins: [praline({ sources: "src/components", emit: "dts" })],
});
```

Import a component through its JavaScript module name:

```ts
import template, { type Refs } from "./panel.html.js";
```

The source stays `panel.html`. Vite supplies the JavaScript module; TypeScript resolves adjacent `panel.html.d.ts` or `panel.html.ts` contracts. A physical `.html.js` file is unnecessary.

`sources` is required. It accepts a string or readonly array of files, recursive directories, and globs, relative to Vite's root. It marks an ownership boundary: selected HTML is compiled even if an adjacent generated JS file exists. Unselected modules, ordinary `.html` imports, HTML page entries, and queries such as `?raw` retain Vite's normal behavior.

By default, `emit: "none"` serves virtual JavaScript without writing files. This suits JavaScript projects. `emit: "dts"` maintains declarations for TypeScript and editor support. Vite supplies virtual JavaScript in every output mode.

| Option               | Meaning                                         | Default     |
| -------------------- | ----------------------------------------------- | ----------- |
| `sources`            | A file, directory, glob, or array of selections | Required    |
| `exclude`            | Exclusion patterns relative to the Vite root    | `[]`        |
| `emit`               | `"none"`, `"js"`, `"ts"`, or `"dts"`            | `"none"`    |
| `types`              | Imported or embedded helper types               | `"import"`  |
| `clean`              | Remove other generated formats after success    | `false`     |
| `update`             | Compare generated content or the source hash    | `"content"` |
| `preserveWhitespace` | Preserve everywhere, or in additional tags      | `false`     |

The plugin discovers selected sources at startup. With `emit: "none"`, only imported modules are compiled; unused HTML is not validated. Durable output or explicit cleaning processes the full selection, including unimported files. Vite's watcher maintains the selection and generated output after edits, additions, and deletions, and invalidates affected modules.

Compilation errors preserve previous generated output until the HTML is fixed. Independent startup errors are collected after valid files are processed. Unchanged output is not rewritten.

With declaration output enabled, Vite supplies the development watcher. Before a standalone TypeScript check when Vite is not running, generate declarations once with the CLI.

## CLI

Use `praline` in an npm script, after a global installation, or through `npx`:

```sh
npx praline panel.html
npx praline src/components --emit dts
npx praline "src/**/*.html" --exclude pages
npx praline --emit none src/components
```

Quote globs so Praline expands them consistently across shells. Directories are searched recursively; overlapping selections are deduplicated and processed in sorted order. Each HTML source is compiled independently.

| Option                             | Meaning                                          | Default            |
| ---------------------------------- | ------------------------------------------------ | ------------------ |
| `--emit none\|js\|ts\|dts`         | Adjacent output format                           | `ts`               |
| `--types import\|embed`            | Helper-type dependency mode                      | `import`           |
| `--update content\|source`         | Generated-file update policy                     | `content`          |
| `--exclude <pattern>`              | Omit matching inputs; repeatable                 | No exclusions      |
| `--clean`                          | Remove other generated formats after success     | Off                |
| `--log-level verbose\|info\|error` | File statuses, totals, or errors only            | `verbose`          |
| `--preserve-whitespace`            | Preserve authored whitespace everywhere          | Off                |
| `--preserve-whitespace-tag <tag>`  | Preserve an additional tag's subtree; repeatable | Built-in tags only |
| `--help`, `-h`                     | Print usage                                      |                    |
| `--version`, `-v`                  | Print the package version                        |                    |

No inputs prints usage with an unsuccessful exit status. Help and version succeed without inputs. Missing files, unmatched selections, and invalid HTML produce errors; independent valid files are still processed. Any error gives the invocation an unsuccessful exit status.

The CLI reports paths relative to the working directory. Verbose output identifies each file as `updated`, `up to date`, or `valid` for validation-only runs, followed by totals:

```text
src/components/panel.html.d.ts up to date
1 file checked, 0 updated, 0 failed.
```

`info` prints totals only; `error` suppresses status output. Errors always go to stderr. Checked totals count discovered files; failures include selection and compilation errors.

## Selecting and excluding files

Recursive discovery skips dot-prefixed directories and `node_modules`. Explicit files and directories inside them are allowed. `dist` and `build` have no special treatment; exclude output directories when a selection would otherwise include them.

Exclusions use familiar ignore-pattern rules without negation or rule ordering:

| Pattern         | Matches                                         |
| --------------- | ----------------------------------------------- |
| `index.html`    | That filename at any depth                      |
| `draft-*.html`  | Matching filenames at any depth                 |
| `pages`         | Files or directories named `pages` at any depth |
| `pages/`        | Directories named `pages`, with their contents  |
| `src/pages`     | That path relative to the selection base        |
| `/index.html`   | Only `index.html` at the selection base         |
| `**/private/**` | An explicit path glob                           |

The base is the CLI working directory or Vite root, not each selected directory. Matching a directory excludes its descendants, including explicitly selected files. User exclusions also apply to explicit inputs. A selection with no remaining HTML inputs reports an error.

```sh
npx praline examples --exclude index.html
npx praline src --exclude pages --exclude build
```

## Output formats

All output is adjacent to the HTML source:

| Format | File              | Contents                                               |
| ------ | ----------------- | ------------------------------------------------------ |
| `none` | None              | Validation only in the CLI; virtual JavaScript in Vite |
| `js`   | `panel.html.js`   | Runtime blueprint values                               |
| `ts`   | `panel.html.ts`   | Runtime values and typed contracts                     |
| `dts`  | `panel.html.d.ts` | Declarations for runtime exports                       |

Ordinary fragments export their blueprint as default. Named native templates produce named blueprint exports and their contracts. A file consisting of one named template exports only that blueprint, without an outer default. Empty contracts are omitted. See [DOM construction and contracts](docs/DOM.md) for the generated API.

Each mode writes only its selected format. Switching modes leaves other files in place unless cleaning is requested. `--clean` or `clean: true` removes the other known counterparts after successful compilation. With emit none it removes all three generated formats. Cleaning affects selected HTML sources only, leaves HTML and other extensions untouched, and preserves previous output after errors.

Generated files can be ignored in Git and formatters:

```gitignore
*.html.js
*.html.ts
*.html.d.ts
```

### Imported or embedded types

Typed output defaults to importing only the required public helpers:

```ts
/// <reference lib="dom" />
import type { Blueprint, HtmlElement, ParamContent } from "@alexdrel/pralinejs";
```

These imports add no browser runtime dependency. The DOM reference makes native element and event types available even in mixed Node/browser projects.

Use `--types embed` or `types: "embed"` when generated output must carry its contracts without importing Praline. The compiler includes the required structural helper definitions. Both modes have the same contracts and apply to TS and declaration output; JavaScript output is unaffected.

### Updating generated files

The default `update: "content"` compares exact generated content and leaves unchanged files and timestamps alone.

For checked-in output that may be formatted or edited, `--update source` or `update: "source"` records the HTML source hash in a comment. An existing file is left untouched while that recorded hash matches. Changed HTML replaces it; missing files or hash comments regenerate it.

Compiler and option changes alone do not invalidate source mode. Delete the generated file or run once with content mode to rebuild it. Vite always compiles virtual JavaScript with current options, regardless of how durable files are updated.

## HTML and whitespace

Praline uses HTML parsing rules, including browser tree corrections. Decoded entities, comments, and multiple roots are preserved. Reported parse errors and semantic conflicts fail compilation.

By default, each run of HTML whitespace in a text node becomes one newline if it contains a newline, or one space otherwise. This removes indentation while retaining separators. Non-breaking spaces are unchanged. The entire subtrees of `pre`, `textarea`, `script`, and `style` always preserve whitespace.

`preserveWhitespace: true` preserves all authored whitespace. An array such as `preserveWhitespace: ["ascii-art", "code-editor"]` adds preserved tags alongside the built-ins. The CLI equivalents are `--preserve-whitespace` and repeatable `--preserve-whitespace-tag` options. This affects HTML compilation, not supplied parameter values.

## Compiler API

```ts
import { compileHtml } from "@alexdrel/pralinejs/compiler";

const js = compileHtml(source, "js");
const declarations = compileHtml(source, "dts", { types: "embed" });
```

`compileHtml(source, format, options)` defaults to TS output. `parseHtml`, `validate`, and `emitModule` expose the same stages individually. Parsing options include whitespace preservation; emission options select imported or embedded types. The compiler returns strings and performs no output-file writes. Its semantic model and module strategy are described in [Compiler](docs/Compiler.md).
