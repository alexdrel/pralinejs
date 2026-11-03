# Compiler structure and generated contracts

The compiler preserves one semantic model from parsing through emission. CLI and Vite add file selection and lifecycle behavior around the same pipeline:

```ts
import { parseHtml, validate, emitModule } from "@alexdrel/pralinejs/compiler";

const module = parseHtml(source, options);
validate(module);
const code = emitModule(module, "js");
```

`compileHtml` performs this sequence for callers that need only the output. Filesystem operations and Vite hooks stay outside the compiler.

## Tooling components

CLI and Vite are adapters around shared source selection and HTML conversion. Both can write generated files through the same output handling. Vite also supplies the resulting JavaScript directly as virtual modules, without requiring a file write.

```topos scale=0.7

┌──────────┐         ┌─────────┐       ┌──────────┐        ┌───────────────────────────┐
│   CLI    ├────────▶│ Sources │──────▶│ Compiler ├───────▶│   Generated ts/.d.ts/js   ├┐
└──────────┘         └────▲────┘       └────┬─────┘        └┬──────────────────────────┘├┐
                          ┆                 ┆               └┬──────────────────────────┘│
                          ┆                 ┆                └───────────────────────────┘
┌──────────┐              ┆                 ┆
│   Vite   ├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                 ┆                       ┌────────────────────┐
└──────────┘                                ┆                      ┌┴───────────────────┐│
                                            ┆                     ┌┴───────────────────┐├┘
                                            └┄┄┄┄┄Vite only┄┄┄┄┄┄▶│ Virtual js modules ├┘
                                                                  └────────────────────┘

```

Source selection belongs to `src/files/inputs.ts`; generated-file paths, update checks, and cleaning belong to `src/files/output.ts`. `src/cli/` handles invocation and reporting. `src/vite/` handles imports, watching, and module invalidation. The virtual-module path is specific to Vite; the compiler and file operations remain reusable without it.

## Parse facts, then validate

The compiler's stages share one semantic model. Parsing constructs it, validation checks it without mutation, and emission reads it to produce the requested module format.

```topos scale=0.7
                                        # HTML conversion

< HTML >──▶( parseHtml )──▶< HtmlModule >──▶( validate )──▶[ emitModule ]──▶( Emit [.d] TS)
                                                                  │
                                                                  └────────▶(   Emit JS   )

```

`HtmlModule` owns its root blueprint, named exports, and native template names. Each compiler `Blueprint` owns its JsonML nodes, parameter/ref/ID contracts, and named child blueprints. JsonML remains the node tree.

HTML parsing records parameter uses, native element tags and namespaces, event names, initialization targets, and child-blueprint relationships. It does not construct TypeScript type strings. Contract properties retain their nested shape and all occurrences, including duplicates and conflicting leaf/group paths. IDs are literal keys rather than dotted paths.

Parsing reports malformed HTML and reference syntax. Validation checks the recorded model without mutation: duplicate live IDs and refs, path collisions, incompatible parameter uses, and invalid export names. Unnamed native template contents are retained too, so their semantic conflicts are validated even though they produce no public export.

Typed emission derives native types, parameter intersections, anchor signatures, and row inputs from those facts. Helper selection reads the same model, rather than searching generated type text or maintaining a parallel feature registry. The writer handles indentation and blocks; declarations are emitted directly from recorded properties.

## Structural types across workflows

The public runtime `Blueprint<Params, Refs, Ids, Templates>` is an ordinary mutable JsonML array with a structural phantom contract. The `__praline` property exists only in its type. A unique-symbol marker would require a shared type declaration to preserve compatibility; the structural property also permits self-contained output.

Import mode references the public package's type helpers. Embed mode selects their definitions from `src/lib/types.ts`. Each `/// Name` marker starts a block extending to the next marker or EOF. The compiler selects needed blocks and removes their exports. That source resource is included in the package and located through its private `#praline-types` import mapping. There is one definition of each helper, without parsing TypeScript declarations or copying the entire runtime into generated output.

Native type aliases delegate to the consumer's DOM maps. This recognizes custom tags and events through ordinary declaration merging and avoids a compiler dependency on a particular TypeScript `lib.dom.d.ts` layout or version.

## Runtime values and type namespaces

Authored template names identify runtime blueprints. Their type namespaces capitalize the first character of each path segment: `menu.item` becomes `Menu.Item`. Validation rejects names that collapse into the same namespace or collide with generated bindings.

JavaScript emission builds dotted export groups as object literals. A grouped blueprint needed while constructing another named blueprint receives a private binding; independent values remain inline. Flat exports supply their own bindings. The default blueprint is emitted after the public groups and can reference their completed values.

TypeScript output uses runtime namespaces for dotted value groups and capitalized type namespaces for contracts. Declarations describe those same exports without repeating their JsonML. All formats preserve shared child-node identity.

JsonML owns tree serialization, indentation, and the outer array. Praline supplies verbatim child-reference expressions, including spread syntax where needed, then writes module declarations and exports. HTML whitespace condensation happens before serialization, leaving the serializer independent of HTML layout rules.

## Module names and ownership

`./panel.html.js` is both a normal generated JavaScript filename and a virtual Vite import. TypeScript resolves its adjacent `.html.ts` or `.html.d.ts` using normal extension substitution. This gives each file an exact contract without wildcard module declarations or query-specific declaration filenames.

Vite's required `sources` selection is an ownership boundary. Selected HTML is compiled even when an adjacent generated JS file exists; unselected modules and ordinary HTML imports remain available to Vite and other plugins. Durable output is a separate `emit` choice, so serving JavaScript does not silently create source files.

CLI and Vite share source discovery, validation, output naming, update policy, and cleaning. Vite adds its watcher and module invalidation. Keeping those responsibilities separate makes file generation independent of a development server.
