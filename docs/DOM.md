# DOM construction and template contracts

Praline constructs native elements from reusable blueprints. This reference covers parameter lookup, generated contracts, named-template population, and the construction instructions used by the runtime. For a first example, see the [README](../README.md); compilation and generated-file options are in [Tooling](../Tooling.md).

## DOM construction

`materialize` accepts any iterable of JsonML nodes, including arrays, generators, and JsonML traversal results. It consumes the iterable once and constructs a detached native `DocumentFragment`, explicit refs, and a separate literal ID collection. The caller chooses where and how to mount it:

```ts
import { materialize } from "@alexdrel/pralinejs";

const { fragment, refs, ids } = materialize(nodes, params);
container.replaceChildren(fragment);
```

Dynamic JsonML uses the same materializer and can carry native event handlers alongside attributes:

```ts
["button", { onClick: () => select(item) }, item.label]
```

Function-valued `onX` properties register native event listeners: strip `on` and lowercase the first remaining letter (`onClick` → `click`, `onKeydown` → `keydown`, `onBeginEvent` → `beginEvent`). Common handlers infer native event types. `$init(element)` is the escape hatch for other setup; it runs after children are constructed, before mounting. These functions are construction instructions and are not emitted as DOM attributes.

Event attributes in HTML must consist of one whole placeholder, such as `onClick="{{handleClick}}"`, supplied with a function. Literal JavaScript strings and embedded forms such as `onClick="{{code}};"` are rejected. Raw JsonML event values must also resolve to functions.

Declare references with `ref="{{name}}"` or a dotted path such as `ref="{{edit.undo}}"`. These declarations build instance-local nested objects, do not require IDs, and are not emitted as DOM attributes. Ref names are used exactly as authored. IDs appear only in `ids`, with their original spelling; no camelCase aliases are added. An element may have both declarations. Duplicate refs and conflicting paths such as `edit` and `edit.undo` fail explicitly. Native template contents have separate reference scopes.

`$xmlns` selects an element's construction namespace and is inherited by its descendants. An empty string resets construction to HTML via `createElement`; nonempty values use `createElementNS`. It is not emitted as a DOM attribute. Roots start in HTML, independently of the mounting target. The HTML compiler emits `$xmlns` at namespace boundaries reported by its parser, including SVG, MathML, and transitions back to HTML with `$xmlns: ""`. Raw JsonML supplies these boundaries explicitly:

```ts
["svg", { $xmlns: "http://www.w3.org/2000/svg" }, ["circle", { r: 5 }]]
```

Ordinary `xmlns` remains an authored attribute and does not control construction. The runtime does not infer namespaces from tag names or attribute prefixes; attributes such as `xlink:href` receive no special namespace handling.

With generated templates, `materialize` infers native refs and IDs. A single source must satisfy `Params`; an array accepts `Partial<Params>[]`. Parameters can be omitted when the template has no required inputs. Raw JsonML returns refs as `Record<string, unknown>`, since entries may be elements or nested groups; narrow or cast them before use. Its IDs remain `Record<string, Element>`.

## Template parameters

HTML text and attributes can contain named `{{parameters}}`. Compilation generates a `Params` interface and associates it with the template. Pass the source as the second argument to `materialize`; required names and types are checked without explicit generics or `satisfies`:

```html
<button onClick="{{hide}}" title="Close ({{mod}})">{{label}}</button>
```

```ts
const { fragment } = materialize(nodes, {
  hide,
  mod: "Ctrl",
  label: ["strong", {}, "Close"],
});
```

Ordered source arrays use the same inferred API: `materialize(nodes, [adapters, component])`. Each source is checked against `Partial<Params>`; combined completeness is not checked. At runtime the first source containing each top-level key takes precedence, and nested objects stay owned by that source rather than being merged across sources. Missing values still fail during materialization.

To materialize and mount in one step, use `appendChild(target, nodes, params?)`. It uses the target's document, preserves existing children, and returns the created elements' refs. Blueprint parameters and returned refs receive the same checks as `materialize`. Use `materialize` when you also need the fragment, IDs, or initially populated template-ref arrays.

For raw JsonML, parameter sources can be an object or an array of objects without a generated input contract. To associate authored or transformed JsonML with known contracts, cast the array to `Blueprint<Params, Refs, Ids>` and use the same inferred API. Callers handling raw traversal iterables can instead cast the returned refs where they know the structure.

Content parameters accept strings, JsonML nodes, or lists of nodes. Ordinary attribute placeholders require strings; whole event attributes and `$init` accept callables. Event parameters infer native event types. These rules apply equally to outer fragments and embedded templates. Uses in multiple positions narrow the parameter type, and incompatible uses fail compilation. Parameter substitution happens on JsonML before DOM construction, preserves the original template, and never interprets supplied text as HTML or as more placeholders. Missing parameters fail explicitly. IDs can use parameters, such as `id="{{prefix}}-input"` paired with `for="{{prefix}}-input"`; parameterized IDs are omitted from the generated `Ids` contract. Use explicit refs for stable typed access independently of the resolved ID.

A class can `implement Params` and pass its instance directly to `materialize(nodes, this)`. Parameters can also be supplied as an ordered array, such as `[row, component]`. Dotted paths such as `{{history.undo}}` traverse supplied objects and generate nested Params types. Lookup selects the first source containing the first path segment, including prototype properties and getters; a missing nested property does not fall through to another source. Callable parameters bind to the object containing the final property, so `history.undo` runs with `history` as its receiver. Embedded template rows use the same rules with row sources before shared sources. Missing paths report the full parameter name.

The optional third materializer argument is an owner `Document`, useful when constructing nodes in another document or in DOM tests.

### Script and style content

Placeholders in `<script>` and `<style>` content are rejected unless that element explicitly opts in with `unsafe-content-params`:

```html
<script unsafe-content-params>{{code}}</script>
<style unsafe-content-params>{{css}}</style>
```

The compiler and runtime enforce this rule before substitution. The permission applies only to that element's content, is not inherited, and never becomes a DOM attribute. Static scripts and styles remain allowed. In raw JsonML, use `{ "unsafe-content-params": true }`; `false` or omission does not grant permission.

This is permission to interpret supplied content as code or CSS, not sanitization. Templates and JsonML are trusted construction input. Strings in ordinary text positions become text nodes; attribute values retain their native browser semantics, so applications must validate untrusted URLs and other sensitive attribute values. Event attributes always require functions, independently of this permission.

## Embedded templates

A native `<template ref="{{themeItem}}">` declares reusable JsonML and its default position. Its contents have their own parameter and reference scope. The explicit ref names the exported plain JsonML array `themeItem`, its nonempty `ThemeItem.Params`, `ThemeItem.Refs`, `ThemeItem.Ids`, and `ThemeItem.Templates` contracts, the materialized `refs.themeItem` anchor, and initial population through `params.themeItem`. The outer JsonML references it as `["template", { ref: "{{themeItem}}" }, ...themeItem]`, keeping the native anchor without duplicating its blueprint. IDs have no role in naming or population.

Blueprint values retain their authored names; type namespaces capitalize the first character of each path segment. For example, `themeItem` has contracts under `ThemeItem`, and `menu.item` has contracts under `Menu.Item`. Names that would collapse into the same type namespace are rejected during compilation.

Each scope with named templates also exports their full blueprint types:

```ts
export interface Templates {
  themeItem: typeof themeItem;
  fontItem: typeof fontItem;
}
```

The fourth `Blueprint` type argument carries this collection. Dotted template names produce nested groups, and each child blueprint carries its own collection. Nested parameters remain in their own contracts. This metadata describes the nested blueprints; input checking follows the simple Params/Partial<Params>[] rule.

The generated outer `Params` includes its own inputs and `themeItem?: readonly Partial<ThemeItem.Params>[]` for optional initial population. Nested template parameters and refs stay in the template's own contracts; they are not promoted into the outer contract. Component methods can supply shared row parameters alongside initial population:

```ts
const params = { themeItem: themes } satisfies Partial<Params>;
const { fragment, refs, themeItemRefs } = materialize(nodes, [component, params]);
```

When initial rows are supplied, the result also contains an array of each instance's refs, under the template's name with a `Refs` suffix. If the template declares refs, `themeItemRefs` has type `ThemeItem.Refs[] | undefined`; otherwise its entries have type `object`. An explicit empty row array returns `[]`; an omitted or undefined population adds no result property. Each materialization owns its arrays and element references.

These arrays describe initial population only. Later `replaceItems`, `appendItems`, and `prependItems` calls do not update them. Dotted template names produce optional nested groups in the result, such as `result.menu?.itemRefs`. The top-level template-name segments `fragment`, `refs`, and `ids` are reserved to avoid collisions with materialization's standard fields. The native anchors remain in `refs` as before.

Each materialization gets its own native `HTMLTemplateElement` augmented with typed `TemplateAnchor` methods:

```ts
const replaced = refs.themeItem.replaceItems(themes);
const appended = refs.themeItem.appendItems(moreThemes);
const prepended = refs.themeItem.prependItems(firstThemes);
```

Each call returns the refs of the instances it creates. For a template with parameters and refs, the anchor is typed as `TemplateAnchor<ThemeItem.Params, ThemeItem.Refs>` and returns `ThemeItem.Refs[]`. These are separate arrays; the original materialization result is unchanged.

The optional second method argument is `above = false`. It selects the region before or after the anchor; append/prepend order is relative to the existing nodes in that region. Replacement removes all sibling nodes on the chosen side, including text and comments. If the anchor has been removed, the methods use its saved parent and operate on all of that parent's children. Native DOM methods retain their meanings.

Population uses the JsonML blueprint, not the native template's `.content`. Initial population and later anchor calls use the same mechanism. The exported blueprint has no DOM parent and can be reused independently. Dotted template refs follow the same structure: `ref="{{menu.item}}"` exports the runtime value `menu.item` and type namespace `Menu.Item`, exposes `refs.menu.item`, and reads initial rows from `params.menu.item`. A template without a ref remains native inert markup, without a named export or initial population.

If the entire file is one named template, ignoring surrounding whitespace and comments, generation emits only the named blueprint and its nonempty contracts. There is no outer fragment or default export:

```html
<template ref="{{row}}"><span ref="{{label}}">{{text}}</span></template>
```

Import `{ row }` and materialize its content directly with `materialize(row, { text: "Hello" })`; its parameters and returned refs are inferred just like an outer fragment. Templates without parameters omit `Params`; their embedded anchors use `object` for that type argument when refs are present, and initial row inputs are `readonly object[]`. Anchors without either contract use bare `TemplateAnchor`. A blueprint with no contracts needs no namespace.

Each row's parameters take precedence over the surrounding materialization's shared parameters. A handler such as `selectTheme` can be supplied once, while rows contain the varying data. Anchor methods retain those shared bindings for later population. Row inputs use `Partial`; required values missing from both row and shared sources fail at runtime. The type checker does not verify their combined completeness.

## Generated contracts

A compiled blueprint is an ordinary mutable JsonML array. Its `Blueprint<Params, Refs, Ids, Templates>` type carries four contracts through a structural, type-only `__praline` property. No wrapper or metadata is added to the array at runtime. Empty contracts are omitted from exports and represented by `object` in the blueprint type.

`Params` describes supplied values; `Refs` describes explicit element references; `Ids` retains literal authored IDs; `Templates` describes named child blueprints. `BlueprintParams<B>` and `BlueprintRefs<B>` extract the corresponding types from an authored or generated blueprint.

Content parameters use `ParamContent`: a string, a `ParamNode`, or a list of nodes. `ParamNode` accepts Praline construction attributes such as handlers and `$init`, in addition to ordinary attribute values. This extends the serializable JsonML used by generated blueprints with callable construction instructions.

Generated element and event aliases use the consuming project's DOM maps: `HtmlElement<Tag>`, `SvgElement<Tag>`, `MathElement<Tag>`, and `DomEvent<Name>`. Custom map entries participate automatically. Unknown names fall back to `HTMLElement`, `SVGElement`, `MathMLElement`, or `Event`.
