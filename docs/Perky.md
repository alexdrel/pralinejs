# Praline and Perky

Praline constructs a component's DOM and gives its code typed references to native elements. [Perky](https://github.com/alexdrel/perky) can supply the other half of an interactive component: a model announces a change, and the component updates those elements.

The connection is an ordinary subscription. There is no binding language between the two libraries, and neither requires the other. This guide follows the patterns used in the [color picker](../examples/color-picker/README.md) and [Topos](../topos/README.md).

```sh
npm install @alexdrel/pralinejs @alexdrel/perky
```

## One model, several views

The color picker exposes a `Signal<ColorModel>`. Its immutable model contains the selected color space and channel values, and provides operations that return a new color:

```ts
import { Signal } from "@alexdrel/perky";
import { ColorModel } from "./color.ts";

const model = new Signal(ColorModel.fromHex("#5979e8"));
model.value = model.value.withHex("#26a68c");
```

Assigning a new model announces the change. The picker updates its controls; its color-map component updates the selection markers. Both read the same current value, so pointer interaction, text input, and programmatic changes follow the same path.

```topos scale=0.7
                                # One color, several views

[ Color changes ]──▶[ Signal<ColorModel> ]──╮
                                            ├─subscribe─▶[ Picker controls ]
                                            │
                                            ├─subscribe─▶[    Color map    ]
                                            │
                                            ╰─subscribe─▶[   Host preview  ]
```

Color changes replace the signal's value. Each subscriber then reads that model and updates its own existing DOM. The picker and color map schedule their updates through `throttle`; the host preview updates directly in its subscription.

The host page can subscribe too:

```ts
import { ColorPicker } from "./color-picker/picker.ts";

const picker = new ColorPicker(document.getElementById("picker")!);
const preview = document.getElementById("preview")!;

const unsubscribe = picker.model.subscribe((color) => {
  preview.style.backgroundColor = color.hex;
});
```

Subscription immediately delivers the current value, so the preview gets its initial color through the same code that handles later changes. Perky signals notify on assignments, including equal values. Mutating a field inside the stored object does not notify; replacing the immutable color model makes each change explicit.

The host owns its preview and its subscription. The picker owns its controls and the color map. Sharing a model does not require sharing DOM references or making one component update another's elements.

## Update existing elements

Materialization happens when the picker is constructed. Its model subscription subsequently calls `render`, which writes to the elements already created:

```ts
render() {
  const model = this.model.value;
  this.refs.space.value = model.space;
  this.refs.hex.value = model.hex;
  this.refs.swatch.style.backgroundColor = model.hex;
  this.refs.css.textContent = model.css;
}
```

This excerpt from [the picker](../examples/color-picker/src/color-picker/picker.ts) leaves out its channel controls. The method name has no framework significance: it is application code making native DOM updates. Input controls stay in place as the model changes.

The picker can use class methods as HTML parameters and still use subscriptions for model updates. `materialize(template, this)` binds supplied methods to their owner; a model notification is a separate connection that the component establishes itself.

## Combine update requests

Several properties or sources may request the same DOM update during one synchronous operation. Perky's `throttle` combines those requests into a single microtask. The callback reads current state when it runs.

The picker's constructor installs it before subscribing:

```ts
import { throttle } from "@alexdrel/perky";

throttle(this, "render");
const unsubscribe = this.model.subscribe(this.render);
```

The method form replaces `this.render` with a wrapper that retains the instance as its receiver. Calls remain `this.render()`, but execution is deferred. Install the wrapper before handing the method to a subscription or other caller.

The functional color map uses the callback form:

```ts
const unsubscribe = model.subscribe(throttle(render));
```

This batches requests within a synchronous turn; it does not limit rendering to one update per animation frame. The signal still reports each assignment. Only the requested work is combined, and changes made during that work can schedule another microtask.

Topos's viewer uses the same pattern when source changes, paper settings, and theme notifications can all request an SVG update.

## Observe local fields

A shared signal is useful when several consumers need the same state. A local component field can remain a plain property, with `observe` adding assignment notifications where they help.

Topos's source editor uses one `overwriteMode` field to update two controls:

```ts
import { observe } from "@alexdrel/perky";

observe(this, "overwriteMode", (overwrite) => {
  refs.overwriteBtn.classList.toggle("active", overwrite);
  refs.overwriteBtn.setAttribute("aria-pressed", String(overwrite));
  refs.sourceInput.classList.toggle("ovr-active", overwrite);
});
```

The initial field value is delivered immediately. Later code assigns normally:

```ts
this.overwriteMode = !this.overwriteMode;
```

`observe` installs a signal-backed accessor on the field and returns an unsubscribe function. Further observers share that accessor. It observes assignments to that property, not mutations inside an object stored there; use it with ordinary mutable data fields rather than existing accessors.

The same mechanism works with a plain object returned by a functional component. Topos's Cheatsheet observes its `visible` property to update the overlay's native `hidden` property. Choosing a function or class does not change the update model.

## Context for ambient values

Pass a writable signal explicitly when it is part of a component's public interaction, as with the picker's color model. A context is useful for values that surrounding application code supplies to a group of consumers, such as a theme.

```ts
import { Context, Signal } from "@alexdrel/perky";

const Theme = Context.key("light");
const theme = new Signal("light");
const context = new Context(Theme(theme));

const unsubscribe = context.observe(Theme, (value) => {
  document.body.dataset.theme = value;
});

theme.value = "dark";
```

`context(Theme)` reads the current value. `context.observe(Theme, listener)` immediately delivers it and follows later changes when the binding is observable. The owner retains the writable signal; context consumers read and observe its value.

A derived context can override a value for one subtree or preview without changing its parent:

```ts
const previewContext = context(Theme("light"));
```

Topos also uses an observable as the key's default: `Context.key(themeSignal)`. Its viewer observes that key and requests an update when the host theme affects its output. The context supplies state; the viewer still decides what DOM work is needed.

## End subscriptions with their owner

Subscriptions to an external model can keep a component reachable after its DOM is removed. The picker and color map expose explicit disposal. The picker releases its own subscription, disposes its child, and clears its mount:

```ts
this.dispose = () => {
  unsubscribe();
  this.colorMap.dispose();
  mount.replaceChildren();
};
```

The host releases the subscription it created separately:

```ts
unsubscribe();
picker.dispose();
```

Signal subscriptions, property observation, and context observation all return unsubscribe functions. Unsubscribing stops future notifications; it does not cancel work already queued by `throttle`. Neither library adds an automatic component lifecycle, so ownership remains visible in application code.

For Perky's complete context and notification semantics, see its [documentation](https://github.com/alexdrel/perky#readme). For Praline's construction and parameter contracts, see the [DOM reference](DOM.md).
