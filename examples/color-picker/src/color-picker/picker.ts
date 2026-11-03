import { materialize } from "@alexdrel/pralinejs";
import { Signal, throttle } from "@alexdrel/perky";
import template, { type Channels, type Params, type Refs } from "./picker.html.js";
import { channelSettings, ColorModel, type ColorSpace } from "./color.ts";
import { ColorMap } from "./color-map.ts";
import "./picker.css";

export class ColorPicker implements Params {
  model: Signal<ColorModel>;
  refs: Refs;
  colorMap: ReturnType<typeof ColorMap>;
  channelsRefs: Channels.Refs[];
  dispose: () => void;

  constructor(mount: HTMLElement, hex = "#5979e8") {
    this.model = new Signal(ColorModel.fromHex(hex));
    const channels = ["0", "1", "2"].map((channel) => ({ channel }));
    const { fragment, refs, channelsRefs } = materialize(template, [{ channels }, this]);
    this.refs = refs;
    this.channelsRefs = channelsRefs!;
    this.colorMap = ColorMap(refs.map, this.model);
    mount.appendChild(fragment);
    throttle(this, "render");
    const unsubscribe = this.model.subscribe(this.render);
    this.dispose = () => {
      unsubscribe();
      this.colorMap.dispose();
      mount.replaceChildren();
    };
  }

  setColor(hex: string) {
    this.model.value = this.model.value.withHex(hex);
  }

  changeSpace({ currentTarget }: Event) {
    this.model.value = this.model.value.withSpace((currentTarget as HTMLSelectElement).value as ColorSpace);
  }

  changeChannel({ currentTarget }: Event) {
    const input = currentTarget as HTMLInputElement;
    if (!input.checkValidity()) return;
    this.model.value = this.model.value.withChannel(Number(input.dataset.channel), input.valueAsNumber);
  }

  changeHex() {
    if (this.refs.hex.reportValidity()) this.setColor(this.refs.hex.value);
  }

  render() {
    const model = this.model.value;
    const { refs } = this;
    refs.space.value = model.space;
    for (const [channel, controls] of this.channelsRefs.entries()) {
      const { label, max, unit } = channelSettings[model.space][channel];
      controls.label.textContent = controls.numberLabel.textContent = label;
      controls.unit.textContent = unit;
      controls.slider.max = controls.number.max = String(max);
      controls.slider.value = controls.number.value = String(Math.round(model.channels[channel]));
    }
    const hex = model.hex;
    refs.hex.value = hex;
    refs.swatch.style.backgroundColor = hex;
    refs.css.textContent = model.css;
  }
}
