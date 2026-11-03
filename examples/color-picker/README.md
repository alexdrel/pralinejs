# A color picker in an ordinary page

Praline can build a widget inside an existing web app. This example embeds a color picker in an ordinary HTML page: the widget owns its controls, while the page owns a preview card and preset buttons. They share an immutable color model through a signal.

## Mounting the widget

[index.html](index.html) supplies an empty mount point:

```html
<div id="picker"></div>
```

The widget mounts into that element:

```ts
import { ColorPicker } from "./color-picker/picker.ts";

const picker = new ColorPicker(document.getElementById("picker")!);

picker.model.subscribe((color) => {
  preview.style.backgroundColor = color.hex;
});
```

The subscription connects the widget's color to the host's preview. The surrounding app can also call `picker.setColor("#26a68c")`; it doesn't need access to the widget's controls. [main.ts](src/main.ts) shows the page's integration.

## HTML declares the widget's contract

[picker.html](src/color-picker/picker.html) contains ordinary elements with named references and handler parameters:

```html
<select ref="{{space}}" onChange="{{changeSpace}}" title="Color space">
  <option value="rgb">RGB</option>
  <option value="hsl">HSL</option>
  <option value="hwb">HWB</option>
</select>
```

The Vite plugin supplies this HTML as `./picker.html.js` and generates its TypeScript declaration. `Refs` describes native elements such as `space: HTMLSelectElement`; `Params` describes required handlers such as `changeSpace`.

The class implements that generated contract and supplies itself as the parameter source:

```ts
export class ColorPicker implements Params {
  // ...
}

const { fragment, refs } = materialize(template, this);
```

`materialize` creates native DOM, binds supplied methods to their source instance, and returns typed element references. There is no component base class or lifecycle to implement.

## Repeated markup, local and shared parameters

The three channels come from a named template in the same HTML file.

The template name `channels` also names its initial-population parameter; `channelsRefs` names the returned refs array. Its generated type contracts live under the capitalized namespace `Channels`, so the component stores `Channels.Refs[]`.

Each slider combines a local channel with a shared handler:

```html
<input ref="{{slider}}" type="range" min="0" step="1"
  data-channel="{{channel}}" onInput="{{changeChannel}}" />
```

The constructor creates the widget and its channels in one call:

```ts
const channels = ["0", "1", "2"].map((channel) => ({ channel }));
const { fragment, refs, channelsRefs } = materialize(template, [{ channels }, this]);
this.refs = refs;
this.channelsRefs = channelsRefs!;
mount.appendChild(fragment);
```

The first source supplies the named template's initial channel parameters. Each entry supplies its local `channel`; shared parameters come from the surrounding sources, so `this` supplies `changeChannel`, automatically bound to the component. The controls are inserted at the native template's location during materialization.

The returned `channelsRefs` array holds each channel's typed refs. It is optional because unpopulated templates add no result property; the assertion here reflects that this call explicitly supplies the channel parameters. These refs are retained for later DOM updates. The array describes this initial population only, rather than tracking future anchor population calls.

## One model, explicit DOM updates

[ColorModel](src/color-picker/color.ts) holds a color space and a readonly three-number `channels` tuple. Operations such as `withChannel`, `withSpace`, and `withHex` return new values, leaving the original unchanged. The model contains color conversions and formatting, with no DOM or Praline dependency.

The component subscribes its `render` method to a Perky `Signal`:

```ts
this.model = new Signal(ColorModel.fromHex(hex));
throttle(this, "render");
this.model.subscribe(this.render);
```

`subscribe` delivers the current value immediately and notifies the component whenever `model.value` is replaced. The subscribed method reads that value and updates existing native elements. This excerpt shows the color fields:

```ts
render() {
  const model = this.model.value;
  const { refs } = this;
  refs.hex.value = model.hex;
  refs.swatch.style.backgroundColor = model.hex;
  refs.css.textContent = model.css;
}
```

The full method also updates the sliders and labels. Perky's `throttle(this, "render")` binds the method to the component and combines synchronous render requests into one microtask. The state and scheduling helpers come from Perky; Praline constructs the DOM.

A native input event produces the next value:

```ts
changeChannel({ currentTarget }: Event) {
  const input = currentTarget as HTMLInputElement;
  if (!input.checkValidity()) return;
  this.model.value = this.model.value.withChannel(Number(input.dataset.channel), input.valueAsNumber);
}
```

That assignment triggers the component's subscription. **No virtual DOM or markup rerendering:** the model is reactive, and the DOM updates are ordinary JavaScript.

## A functional child component

The ring and square are a separate component, [ColorMap](src/color-picker/color-map.ts). The picker's HTML supplies its mount point:

```html
<div ref="{{map}}"></div>
```

The constructor composes them with an ordinary function call:

```ts
this.colorMap = ColorMap(refs.map, this.model);
```

`ColorMap` materializes its own HTML with a local pointer handler and subscribes to the shared model:

```ts
export function ColorMap(mount: HTMLElement, model: Signal<ColorModel>) {
  let hue = 0;
  const { fragment, refs } = materialize(template, { pick });
  mount.appendChild(fragment);
  const unsubscribe = model.subscribe(throttle(render));
```

Its `pick` and `render` functions close over those references and update the ring and square. It returns a `{ model, refs, dispose }` handle retained by the parent. The parent and child each manage their own elements; the shared signal keeps their views of the color synchronized. A component can be a class or a function—composition needs no special Praline API.

Both components expose `dispose()`: unsubscribe and clear the mount's children, leaving the mount itself in place. The picker also disposes its color map. The host releases its own model subscription separately.

## Run locally

After the [repository setup](../README.md), run from this directory:

```sh
npm run serve
```

Vite generates TypeScript declarations while serving or building. `npm run check` type-checks the example; `npm run build` bundles it; `npm test` checks the color conversions.
