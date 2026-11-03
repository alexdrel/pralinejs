# PralineJS

**Vanilla JavaScript. Better with praline.**

PralineJS makes building component-based UIs with vanilla JavaScript straightforward. Compose your interface from ordinary HTML and TypeScript, retaining direct control of the DOM without adopting a framework's programming model.

The usual plumbing between HTML and code—finding elements, wiring event handlers, and maintaining references—is eliminated. Components receive native element references with types inferred from their HTML, while parameters connect markup to application behavior. The result is familiar JavaScript, organized into reusable, self-contained pieces.

Under the hood, HTML is converted into [JsonML](https://www.jsonml.org/): nested arrays describing elements, attributes, and text. Dynamic markup can also be constructed directly as JsonML in code. Both paths use the same materializer to produce native DOM elements.

From a single widget to the UI of an entire application, Praline follows the same approach. With a browser runtime as small as a praline and no external dependencies, even a single component is worth a bite.

There are no prescribed component classes, state management systems, or rendering cycles. Components can be functions or classes, and updates use ordinary browser APIs.

[Praline and Perky](docs/Perky.md) describes one approach to state synchronization, using signals, observed properties, and explicit DOM updates. Perky is optional and is not a runtime dependency.

The construction process is the same for converted HTML and JsonML written in code:

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

```

## HTML meets code

Here is `counter.html`:

```html
<section class="counter">
  <output ref="{{value}}">0</output>
  <button type="button" onClick="{{increment}}">One more</button>
</section>
```

Its component is an ordinary TypeScript function:

```ts
import { materialize } from "@alexdrel/pralinejs";
import template from "./counter.html.js";

export function Counter(mount: HTMLElement) {
  let count = 0;

  function increment() {
    refs.value.textContent = String(++count);
  }

  const { fragment, refs } = materialize(template, { increment });
  mount.appendChild(fragment);
}

Counter(document.getElementById("app")!);
```

Each call creates an independent counter with its own state and elements.

The generated contract identifies `refs.value` as an `HTMLOutputElement` and requires `increment` to be a click handler. Praline attaches the handler during materialization. The `ref` declaration is consumed during construction; it becomes neither a DOM attribute nor an HTML ID.

The `.html.js` import is supplied by Praline's Vite plugin, or produced by the CLI. TypeScript reads the generated contracts; JavaScript applications use the same runtime without them.

## Install and use with Vite

```sh
npm install @alexdrel/pralinejs
```

Select your component sources in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import praline from "@alexdrel/pralinejs/vite";

export default defineConfig({
  plugins: [praline({ sources: "src/components", emit: "dts" })],
});
```

The Vite plugin provides converted HTML as JavaScript modules and updates them when the source changes. `emit: "dts"` also maintains adjacent declarations for type checking and editor support. Generated files can be excluded from version control and formatting. For JavaScript-only use, omit `emit` to serve without writing files.

The standalone CLI handles files, directories, and globs:

```sh
npx praline src/components --emit ts
```

The CLI and Vite plugin run on Node.js 26 or later. The browser runtime has no external dependencies. See [Tooling](Tooling.md) for CLI options, Vite configuration, and generated-file behavior.

## Parameters and reusable markup

Placeholders can supply text, attribute values, event handlers, or constructed content. A native template gives repeated markup a name and a position:

```html
<ul>
  <template ref="{{taskItem}}">
    <li ref="{{item}}">
      <span>{{title}}</span>
      <button type="button" onClick="{{remove}}">Done</button>
    </li>
  </template>
</ul>
```

Praline exports the named template as a separate blueprint. The outer fragment retains the native template element as an anchor:

```ts
import { materialize } from "@alexdrel/pralinejs";
import template, { taskItem } from "./tasks.html.js";

const { fragment, refs } = materialize(template);
document.getElementById("tasks")!.appendChild(fragment);

function addTask(title: string) {
  const { fragment, refs: task } = materialize(taskItem, {
    title,
    remove() {
      task.item.remove();
    },
  });
  refs.taskItem.before(fragment);
}

addTask("Read a chapter");
```

Each row gets its own refs and handlers. Templates can also be populated during outer materialization or through their anchor's `replaceItems`, `appendItems`, and `prependItems` methods.

Parameter sources can be plain objects, class instances, or ordered arrays such as `[row, component]`. Methods are bound to the object that owns them, including when reached through a nested parameter path.

The [Todo example](examples/todo/README.md) develops this pattern into a small application. The [DOM reference](docs/DOM.md) covers nested parameters, template population, IDs, namespaces, and generated types.

## Dynamic content is data

Dynamic elements can be constructed directly as JsonML, including native handlers:

```ts
import { appendChild } from "@alexdrel/pralinejs";

appendChild(container, [
  ["button", { onClick: () => select(item) }, item.label],
]);
```

`appendChild` constructs and appends the nodes, returning their refs. `materialize` returns a detached fragment when mounting needs more control. Both accept iterables, so arrays, generators, and JsonML transformations can feed the same construction path. An HTML fragment can have one root or several.

Ordinary strings become text nodes, including characters that look like HTML. Attribute values keep their browser semantics, so applications must validate untrusted URLs and other sensitive values. Event attributes require functions. Parameter interpolation into script or style content requires explicit permission through `unsafe-content-params`. These boundaries are described in the [DOM reference](docs/DOM.md#script-and-style-content).

## State and composition

Praline constructs the DOM but does not manage application state. Components can hold local values, work with application models, or subscribe to shared state. DOM updates remain explicit.

The [color picker](examples/color-picker/README.md) shows a component embedded in an ordinary page. An immutable color model travels through a [Perky](https://github.com/alexdrel/perky) signal; both the widget and its host subscribe to it. A functional color-map component owns pointer interactions and shares the same model. Explicit disposal releases subscriptions. Perky is an optional companion, rather than a Praline runtime dependency.

CSS requires no Praline-specific support. Components import their stylesheets normally and can use classes, nesting, and native `@scope`.

## Further reading

- [Examples](examples/README.md) — Todo and an embeddable color picker.
- [Tooling](Tooling.md) — CLI, Vite, output formats, and options.
- [DOM construction and contracts](docs/DOM.md) — the runtime API in detail.
- [Praline and Perky](docs/Perky.md) — state and explicit DOM updates.
- [Design](docs/Design.md) — construction boundaries, component ownership, and application models.
- [Compiler](docs/Compiler.md) — semantic analysis, structural types, and module emission.

## Development

From the repository root:

```sh
npm ci
npm test
```

Root checks cover Praline and its standalone examples. Development tools and formatting configuration are shared. The [Topos proving app](topos/README.md) has its own package and commands; it does not participate in Praline's build or required checks. `npm run build` produces the package distribution, and `npm run fmt` formats the repository.

## License

[MIT](LICENSE).
