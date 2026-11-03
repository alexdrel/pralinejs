# HTML, code, and the live DOM

Praline grew out of building the Topos web UI in vanilla JavaScript and TypeScript with a coding agent. Producing browser code was easy; giving that code a readable structure took considerably more work. Large HTML files, manual element lookups, and monolithic behavior modules needed a way to become independently understandable pieces.

The useful parts of that approach were already ordinary web programming: authored HTML, native controls, direct manipulation of elements, and application models with their own operations. Praline supplies the construction and composition contracts around those parts.

## Construction is a boundary

Authored HTML passes through the CLI or Vite plugin as a straightforward conversion to JsonML arrays describing its elements, attributes, and text. Dynamic elements are written directly as JsonML tuples in JavaScript or TypeScript. Both paths supply the same construction input to `materialize`.

`Params` supplies the values and handlers used by that input. Materialization creates native DOM nodes and returns `Refs` pointing to the elements the author named. Those refs provide direct access to the resulting DOM; they do not wrap the elements or maintain a separate view of their state.

```topos scale=0.8
                                                            # PralineJS

                                             ╭────────╮
                                             │ Params ├──┐
┏━━━━━━━━━━━━━━━━━┓                          ╰────────╯  │
┃  Authored HTML  ┠──cli/vite───╮                        │
┗━━━━━━━━━━━━━━━━━┛             │                        │           ╭────────────╮
                                │    ╔════════╗   ┌──────▼──────┐    │            │
                                ◆───▶║ JsonML ╟──▶│ materialize ├───▶│ Native DOM │
                                │    ╚════════╝   └──────┬──────┘    │            │
┌─────────────────┐             │                        │           ╰─────▲──────╯
│ Dynamic elements├─typed tuples╯                        │                 ┆
└─────────────────┘                                      │    ╭────────╮   ┆
                                                         └───▶│  Refs  ├┄┄┄┘
                                                              ╰────────╯

:legend
%HTML%: blue
materialize, Params, Refs: orange
[Native DOM]: pill, green
```

The JsonML tree describes construction. It is not retained as a second representation of the live page. After mounting, application code updates native elements, subscribes to its model, or replaces a region when appropriate. An active editor or form can retain its controls and browser state throughout those updates.

This boundary also makes incremental adoption practical. A Praline component can mount into an existing page, return an ordinary object or class instance, and expose a model subscription to its host. It does not require the surrounding application to share a component base class or render cycle.

## Structure stays readable

Static markup belongs in HTML where the author can see its hierarchy, controls, labels, and styles. Dynamic markup can remain inline JsonML when moving a few tuples into another file would obscure the code. Both paths use the same materializer.

Explicit `ref="{{name}}"` declarations identify instance-local access points. IDs retain their browser meaning, including label relationships and document-wide lookup. Keeping these collections separate allows repeated components to use refs without turning every local name into a document ID.

Named native templates provide reusable construction input and an anchor for later population. Their contents retain separate contracts, so an outer fragment does not acquire every row's parameter and reference names. Initial-population ref arrays are snapshots of construction; anchor methods return the refs they create rather than maintaining a second live collection of the DOM.

## Models and components remain application choices

A component can be a function or a class. A shared model can use subscriptions, signals, or an application's existing notification mechanism. Perky supplies optional state and context tools; Praline's browser runtime does not depend on it.

[Praline and Perky](Perky.md) describes how these pieces work together in the picker and Topos, including property observation, update scheduling, and subscription ownership.

The color-picker example uses an immutable model carried by a signal. Both the picker and its host subscribe to that model and update their own DOM. The Todo example is small enough to read its task state from the controls. Neither representation is a framework requirement.

Lifetime follows the same ownership rule. A component that subscribes to an external model can expose `dispose()` to unsubscribe and clear its mount. Element-local handlers normally disappear with the nodes that own them; subscriptions and global listeners need explicit lifetime ownership. Praline does not supply an automatic component lifecycle.

## CSS remains CSS

Components import ordinary stylesheets through their build tool. Root classes, nesting, and native `@scope` can express boundaries without generated selectors or runtime stylesheet injection. Several independently mounted roots can be styled separately in one stylesheet. A multi-root fragment is supported, but it does not dictate the component or CSS model.

## Explicit construction instructions

Function-valued `onX` attributes register native listeners. `$init` provides setup that does not fit an event attribute. `$xmlns` selects construction namespaces explicitly; ordinary authored `xmlns` is preserved as an attribute. The runtime does not guess an element's namespace from its tag or mounting target.

Strings supplied as content become text nodes. Templates and JsonML remain trusted construction input, like imperative DOM creation. Script and style content parameters require `unsafe-content-params` because an ordinary text substitution in those positions becomes code or CSS. This opt-in marks that boundary; it does not sanitize supplied content. URL attributes retain native browser semantics.

See [DOM construction and template contracts](DOM.md) for the exact rules.

## Package and test boundaries

One package exposes the browser runtime at its root, the compiler at `/compiler`, the Vite plugin at `/vite`, and the `praline` executable. The runtime bundle and declarations have no external dependencies. Tooling uses JsonML and parse5, plus Node built-ins; Vite is an optional peer. Perky is an application choice.

Source ownership follows the package boundaries:

| Directory       | Responsibility                                               |
| --------------- | ------------------------------------------------------------ |
| `src/lib/`      | Browser runtime and public construction types                |
| `src/compiler/` | HTML parsing, validation, contracts, and emission            |
| `src/files/`    | Shared source discovery, output paths, writing, and cleaning |
| `src/cli/`      | Command-line arguments and invocation                        |
| `src/vite/`     | Vite resolution, watching, and module invalidation           |
| `scripts/`      | Repository build and release utilities                       |
| `examples/`     | Standalone teaching examples                                 |
| `topos/`        | Independent proving app and its tooling                      |

Runtime code and tests do not import from other project folders; external package dependencies are allowed. Tests combining the compiler and runtime belong in `src/compiler/`.

Runtime and tooling have separate build configurations. Tooling entrypoints share a chunk; the browser entrypoint is standalone. TypeScript emits the declaration tree separately. The Topos proving app has its own package and commands and is excluded from Praline's build and required checks.

The teaching examples are npm workspaces: root installation provides their dependencies and links them to the current Praline package. They share the root lockfile and development tools while retaining their own commands. Topos stays outside the workspace. Package contents are selected explicitly, so the examples are not part of Praline's distribution.

Compiler tests use synthetic HTML and small TypeScript consumers across import/embed and TS/declaration modes. Vite tests concentrate on resolution and lifecycle behavior; input and output rules are tested in their owning modules.
