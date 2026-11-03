export type ColorSpace = "rgb" | "hsl" | "hwb";
type Channels = readonly [number, number, number];

export const channelSettings = {
  rgb: [
    { label: "Red", max: 255, unit: "" },
    { label: "Green", max: 255, unit: "" },
    { label: "Blue", max: 255, unit: "" },
  ],
  hsl: [
    { label: "Hue", max: 360, unit: "°" },
    { label: "Saturation", max: 100, unit: "%" },
    { label: "Lightness", max: 100, unit: "%" },
  ],
  hwb: [
    { label: "Hue", max: 360, unit: "°" },
    { label: "Whiteness", max: 100, unit: "%" },
    { label: "Blackness", max: 100, unit: "%" },
  ],
};

function hueRgb(hue: number, chroma: number, offset: number): Channels {
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const sectors = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ];
  const [red, green, blue] = sectors[Math.floor(hue / 60) % 6];
  return [(red + offset) * 255, (green + offset) * 255, (blue + offset) * 255];
}

export class ColorModel {
  readonly space: ColorSpace;
  readonly channels: Channels;

  constructor(space: ColorSpace, channels: Channels) {
    this.space = space;
    this.channels = channels;
  }

  static fromHex(hex: string): ColorModel {
    if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error("Expected a six-digit hex color, such as #5979e8.");
    return new ColorModel("rgb", [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
  }

  withChannel(channel: number, value: number): ColorModel {
    const channels: [number, number, number] = [...this.channels];
    channels[channel] = value;
    return new ColorModel(this.space, channels);
  }

  get rgb(): Channels {
    if (this.space === "rgb") return this.channels;
    const [hue, second, third] = this.channels;
    if (this.space === "hwb") {
      const whiteness = second / 100;
      const blackness = third / 100;
      const sum = whiteness + blackness;
      if (sum >= 1) return [(255 * whiteness) / sum, (255 * whiteness) / sum, (255 * whiteness) / sum];
      return hueRgb(hue, 1 - sum, whiteness);
    }
    const saturation = second / 100;
    const lightness = third / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    return hueRgb(hue, chroma, lightness - chroma / 2);
  }

  get hsv(): Channels {
    const [red, green, blue] = this.rgb;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const hue = this.space === "rgb" ? hueOf(red, green, blue) : this.channels[0];
    return [hue, max ? ((max - min) / max) * 100 : 0, (max / 255) * 100];
  }

  withHsv(hue: number, saturation: number, value: number): ColorModel {
    const color = this.withRgb(hueRgb(hue, ((value / 100) * saturation) / 100, (value / 100) * (1 - saturation / 100)));
    return this.space === "rgb" ? color : color.withChannel(0, hue);
  }

  get hex(): string {
    return "#" + this.rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("");
  }

  get css(): string {
    if (this.space === "rgb") return `rgb(${this.rgb.map(Math.round).join(" ")})`;
    const [hue, second, third] = this.channels.map((value) => +value.toFixed(2));
    return `${this.space}(${hue} ${second}% ${third}%)`;
  }

  withHex(hex: string): ColorModel {
    return ColorModel.fromHex(hex).withSpace(this.space);
  }

  withSpace(space: ColorSpace): ColorModel {
    return space === this.space ? this : this.withRgb(this.rgb, space);
  }

  withRgb(rgb: Channels, space = this.space): ColorModel {
    if (space === "rgb") return new ColorModel(space, rgb);
    const [red, green, blue] = rgb.map((value) => value / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    const lightness = (max + min) / 2;
    const hue = hueOf(red, green, blue);
    if (space === "hwb") return new ColorModel(space, [hue, min * 100, (1 - max) * 100]);
    return new ColorModel(space, [hue, delta ? (delta / (1 - Math.abs(2 * lightness - 1))) * 100 : 0, lightness * 100]);
  }
}

function hueOf(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  if (!delta) return 0;
  if (max === red) return (((green - blue) / delta + 6) % 6) * 60;
  if (max === green) return ((blue - red) / delta + 2) * 60;
  return ((red - green) / delta + 4) * 60;
}
