# Topos proving ground

This directory contains the web app copied from Topos to exercise Praline incrementally. The sibling Topos checkout remains unchanged. General Praline capabilities and API behavior are documented in the [project README](../README.md); this document records the application setup and migration decisions.

## Setup

Topos is an independent npm project. It uses published JsonML and Perky packages and temporarily links Praline through `file:..`. It references the sibling Topos checkout at `../../topos` (relative to this directory) through `#topos/` imports. The development server reads its diagram library and compendium without modifying that checkout.

Development tools are installed once at the repository root and shared with Topos. Topos declares only its app dependencies; its scripts find the root TypeScript, Vite, Oxfmt, and Oxlint commands. Install and build Praline from the root, then install and run the app from this directory:

```sh
cd ..
npm install
npm run build
cd topos
npm install
npm run serve
```

Open the displayed server URL for the editor, or `/slate.html` for the shared-editor harness. The editor title is **Topos Editor - Praline**. Fonts use the same external stylesheets as the original app. Diagram-library and compendium endpoints are development-server features.

Run `npm test` here for Topos type checks, lint, formatting, and tests; `npm run build` produces the app in ignored `build/`. These commands are independent of Praline's root checks and release workflows. `npm run fmt` formats this project only, using the shared root Oxfmt configuration. Root formatting also covers Topos.

Pane and menu components import virtual compiled modules such as `./glyphs.html.js`. The Vite plugin selects `editor` and emits adjacent declarations with `praline({ sources: "editor", emit: "dts" })`. `npm run generate` creates declarations before standalone type checks. Generated files are ignored by Git and the formatter. After Praline tooling changes, rebuild it and restart the development server.

## Migration decisions

Preserve the existing application organization and authored HTML styles while replacing raw HTML imports and temporary template plumbing. Explicit `ref="{{name}}"` declarations supply generated references independently of DOM IDs; retain native selectors where the HTML uses other markers. IDs remain where CSS uses them. Application code controls mounting with ordinary DOM methods. Toolbar groups diagram controls under `refs.diagram`; its reusable templates are named explicitly by `fontItem`, `themeItem`, and `diagramItem` refs.

Source and Slate inherit Panel's separate toolbar/body mounting through generated refs. Slate's separately authored Edit and Create menus are materialized with their own handler parameters and reference types, then mounted into the existing containers. Model subscriptions, global keyboard handling, and dropdown coordination stay in TypeScript.

The diagram menu shows the current document name and refreshes its entries whenever opened. Toolbar owns the display name and originating diagram URL; the model handles content. New creates an untitled document; Reload reloads its originating diagram URL, when present. Editing retains that origin, while opening unrelated text (including Paste) clears it. Compendium is an ordinary open action, not a special selection value. The markup remains in `toolbar.html`; diagram rows use its reusable template.

Intrinsic actions such as button clicks are supplied through HTML handler parameters. Behavioral subscriptions such as the Legend textarea's input, change, and blur listeners stay in TypeScript. The existing dropdown coordination remains in place.

Cheatsheet supplies Mac/PC labels and its close-button handler as parameters. Enamel continues to insert SVG produced by the diagram renderer.

Components import their CSS normally through Vite, beside the HTML import, while stylesheets remain in `css/`. Root classes identify components or their parts, not a styling mechanism. Component-local class selectors belong under their fragment roots, using native nesting, `@scope`, or a combination. Source's header uses nesting under `.source-header`, for example. Scoping is optional and requires no Praline helper; shared controls and external triggers retain explicit shared or component-specific names.

Cheatsheet uses `cheatsheet` on its root, Glyphs uses `glyphs` on its dynamically populated body, and Inspector identifies its header and body with `inspector-header` and `inspector-body`. Their stylesheets currently use native `@scope` with local class names. Global theme variables continue to inherit. Cheatsheet's external help button is styled outside its scope block in the same file. Multiple roots do not require a helper when explicit HTML classes suffice.

Enamel shares one HTML blueprint and an `EnamelViewer` implementation between its main and sidebar viewers. Both use the same internal paper-preference signal, so changing either viewer updates both. `MainEnamelViewer` owns Export and keyboard shortcuts.

## Panel prototype

`editor/panel.ts` receives toolbar and body mounts plus `"side"` or `"main"`. Every component HTML supplies two explicit root refs: `panelToolbar` and `panelBody`, both native HTML elements. Panel mounts them through generated refs, creates a chevron for side mode, and handles title/chevron clicks. The chevron is hidden when the panel cannot collapse. Controls retain their own handlers. It filters authored `data-panel-mode="side"` or `data-panel-mode="main"` elements before binding parameters; absent markers apply to both positions. The attribute remains on retained DOM elements; the reusable blueprint is unchanged.

`this.materialize(blueprint, adapters)` accepts a typed blueprint and returns its `BlueprintRefs<B>`. It requires the two Panel roots and accepts one optional `Partial<BlueprintParams<B>>` adapter, which it combines with `this` at runtime. It does not prove combined completeness. The filtered iterable's refs assertion stays inside Panel, without type arguments or casts at pane call sites.

Panel imports `css/panel.css` for the main/sidebar frames, mounts, headers, titles, content, and collapse behavior, including shared toolbar separators. Layout imports `css/layout.css` for app/workspace arrangement, splitter sizing and interaction, and responsive layout.

Global `editor.css` owns the reset, page defaults, and visibility utility. Shared monospace panel typography lives in `panel.css`; Source and Slate both use `.surface-mono` at 14px with a 1.35 line-height, while Legend keeps its own sizing. The global stylesheet imports theme palettes, reusable control styles, and shared dropdown/menu styling. Checkbox rows belong to menus; danger and success remain reusable control states. Export and Edit use the shared `menu-content two-columns` variant. Component-specific sizing stays with the owner, such as Edit's minimum width in `css/slate.css`.

Legend, Glyphs, Inspector, Source, Slate, and the shared Enamel viewer extend Panel. Side panes supply the same mount for toolbar and body; hiding them hides that shared mount too, so it does not occupy sidebar space. Main panes retain separate toolbar/body mounts and shared body bounds. Inspector's title, metadata, and body live in its HTML fragment instead of the page shell. Panel owns visibility and side expansion; main mode stays expanded. A shared collapsed-header style rotates chevrons. Panel exposes an optional `onResize` hook without owning an observer. Expansion emits the existing resize event, which layout handles.

`App` constructs components in fields and wires them in its constructor. Its `applyMainView` transition explicitly selects visible panels: Slate shows Inspector, Legend, and sidebar Enamel; Source shows Glyphs; SVG shows Legend. It then calls `layout.resize()`. CSS no longer encodes view visibility or pane-specific space allocation. Preview content stays current while collapsed; inactive viewers are cleared when switching views.

## Layout

`Layout` receives the workspace, sidebar, main Panels, and an ordered list of sidebar Panels. Without saved preferences, each panel starts with weight 1. Weights behave like flex-grow values and do not need to sum to one. Layout generates splitters and allocates available height among visible expanded panels, preserving a 96px minimum. Collapsed panels retain their measured header height; hidden panels occupy no space. A sole visible panel is temporarily non-collapsible, stays open, and hides its chevron; its previous expansion choice returns when another panel becomes visible. This rule applies to any sidebar Panel. A sole expanded panel among several visible panels fills the remaining space around collapsed headers. If minimums exceed the available height, the sidebar scrolls. Splitter dragging resizes adjacent expanded panels, skipping hidden/collapsed panels while keeping unrelated panel heights fixed.

Layout owns one ResizeObserver for the workspace/sidebar and listens to window resize events, including font-change invalidation. After applying sizes it invokes `onResize` on visible expanded Panels; Slate refreshes and Enamel recalculates zoom. There is no app-level viewer refresh registry. Workspace width dragging and the 760px stacked breakpoint are retained. Persistence stores sidebar width and ordered weights and writes only during dragging. Hiding, collapsing, and window resizing do not overwrite saved preferences.

## Application signals

`SlatePane` is a class hosting the referenced `src-editor` Slate. Edit menu parameter sources `[adapters, this]` resolve `history.undo`, `history.redo`, and `model.deleteSelected` through the component's existing fields, binding methods to their actual owners. Inline adapters remain for directional duplication. Create menu parameters call `startDrawing` with their respective kinds rather than adding forwarding class members. The class and supplied objects check compatibility with generated Params contracts. It owns web menus, status, ruler-grid persistence, clipboard commands, and shortcuts. App constructs Cheatsheet and assigns its toggle function to `slatePane.toggleCheatsheet`. Both the help button and `?` toggle that component directly; cancellation notifications handle closing other participants rather than paired Help/Replay calls.

Source remains an external text host: `new Source(change, commit)` mounts the pane, `open(text)` supplies its buffer, and edits report through callbacks. It does not subscribe to the Topos model. Textarea selection, overwrite mode, padding, glyph insertion, and native undo remain owned by its editor behavior; app coordinates document history and persistence.

## State-to-DOM synchronization

Source's `overwriteMode` is a plain boolean observed through Perky's `observe`. One callback applies the button's active/pressed state and the textarea's overwrite styling, including initialization. Keyboard and HTML actions use ordinary assignments; HTML does not duplicate initial state.

Enamel observes its nullable `source`, `override`, and `panState` fields through Perky. `null` source means no content; rendering clears or draws accordingly. Override and pan observers own their visual state, leaving handlers to change fields or scroll. Perky's `throttle(this, "render")` is installed before subscriptions: callers request rendering normally, and synchronous requests share a microtask using the latest state. Zoom remains an independent imperative object.

Toolbar observes one `currentDocument` object containing its name, icon, and originating URL. Replacing that object updates the trigger and Reload availability together. Shared theme, font, paper, and main-view settings continue to use signals directly. These are optional tools for explicit DOM updates, not a general binding system; see [models and components](../docs/Design.md#models-and-components-remain-application-choices).

## Persisted settings

Persisted signals use `new PersistedSignal(key, valuesOrParser, apply?)`. An allowed-values list uses its first entry as the default; empty lists are rejected. Alternatively, a custom parser receives the decoded value, or `undefined` for missing or unavailable storage, and owns validation and defaults. Construction applies the initial value without writing to storage. The setter applies core behavior, saves JSON, and then notifies observers. Existing raw string settings are accepted on read and rewritten as JSON on the next assignment. Theme supplies its DOM update as the apply callback; main view attaches its callback after panes exist and applies its initial value after layout initialization. Storage failures leave the signal usable; core behavior failures stop the update.

`app.ts` owns the local persisted `mainEditorView`; its apply callback owns view transitions, layout, previews, and focus. Startup applies the restored view directly without writing it back or notifying again. Toolbar receives it explicitly, and app binds it to the exported `MainEditorView` context key for other consumers. Enamel owns its shared paper signal internally; Slate creates its ruler-grid signal, and layout creates its preferences signal and publishes at its existing save points. There is no aggregate settings schema or registry. Document text persistence stays separate.

`editor/signals/font.ts` owns font options and the persisted `fontSignal`. Its apply callback sets the body CSS variable and dispatches resize. Toolbar imports the options and signal directly; no app wiring or context key is needed.

Toolbar receives Topos's editor model directly: it reads copy text from the document and calls `model.applySource(text)` for new, pasted, or loaded documents, choosing the view itself. No web-local model subclass or whole-document whitespace normalization is added. Before replacement, Toolbar assigns its identity to the shared `cancelInteraction` signal declared in `app-context.ts`. Toolbar owns `currentDocument` metadata; Mono export uses its name rather than inferring it from the dropdown. New and pasted documents are Untitled and have no originating URL. The Monosketch-rendering provider is assigned afterward.

## Interaction takeover

`cancelInteraction` is a `Signal<unknown>` carrying an initiator identity or an event key, initially `null`. Opening a dropdown or Cheatsheet announces that component; participants ignore their own identity and dismiss transient state on another initiator. Closing does not announce a new interaction. App announces view changes and broadcasts `event.key` for Escape from its bubbling keydown handler, allowing focused controls to consume Escape first; dropdowns restore trigger focus only for Escape, not for another participant taking over. Outside-click menu dismissal remains local.

Dropdowns and the functional Cheatsheet keep an explicit observed `visible` property. Toggle changes that value; observers synchronize CSS and announce opening. Cancellation assigns `visible = false`. Visibility is not inferred from CSS classes. The signal's initial `null` means no takeover has occurred; subscriptions need no special initialization guard.

Slate is treated as an external component. Its web wrapper announces drawing/replay requests using the corresponding arrow member as an instance-local identity. The subscriber cancels Slate's interaction unless the initiator is `startDrawing`, and closes its popups unless the initiator is `toggleReplay`. Drawing and replay therefore yield to each other while preserving replay's own toggle behavior. It does not add content-level mouse or keyboard listeners. The imported Slate's internal popup, text-edit, and Escape behavior is unchanged; the web protocol does not attempt to intercept every internal or programmatic transition.

Theme is self-contained in `editor/signals/theme.ts`: option data, the derived `ThemeName` type, persisted `themeSignal`, application to the body, and the `Theme` context key. Toolbar imports the signal and option data directly. Enamel watches the context key, whose default source is that same signal; app setup does not need to bind or pass theme. Main view remains an explicit Toolbar dependency and is bound to the `MainEditorView` key in `editor/app-context.ts`.

## Viewer zoom

Enamel's numeric zoom state and arithmetic live in `editor/zoom.ts`, independent of DOM, Praline, and Topos rendering. The viewer supplies measured fit scale and applies CSS zoom, scroll offsets, and control updates. Stepping and fit/100% switching follow the newer VS Code viewer as a reference; that extension remains unchanged.

## Repeated markup

Toolbar supplies theme and font data once during materialization. `initChoiceMenu` attaches to each existing menu root, writes its shared signal on selection, highlights the current option, and copies that option's text into the trigger's `.choice-label`. Font options supply only the font-family value, with shared styling in CSS.

Inspector uses `inspectorRow.replaceItems(rows)` for later updates.

Toolbar's diagram menu keeps its fixed Compendium action above the anchor and replaces fetched buttons below it with `diagramOption.replaceItems(diagrams)`. Existing entries stay visible until the fetch succeeds. The first button in each folder has `group-start`; CSS draws the divider without additional separator elements. Icons distinguish folders and are copied to the trigger when a diagram opens.

`editor/menus.ts` keeps dropdown and choice behavior together. `DropdownMenu` instances own their existing HTML roots and content; static fields track the active menu and one shared outside-click listener. The cancellation signal closes menus when another participant takes over or Escape is broadcast. Outside clicks use containment rather than propagation suppression. `beforeOpen` starts the diagram-library refresh before showing its menu.

Glyphs deliberately keeps its dynamic groups as inline JsonML, including per-character click closures. Splitting that small structure between HTML and TypeScript would not improve readability. Removing all programmatic markup is not a migration goal.
