import assert from "node:assert/strict";
import { test } from "node:test";
import { ColorModel, type ColorSpace } from "./color.ts";

test("known RGB colors convert to HSL and back", () => {
  for (const [hex, expected] of [
    ["#ff0000", [0, 100, 50]],
    ["#00ff00", [120, 100, 50]],
    ["#0000ff", [240, 100, 50]],
    ["#000000", [0, 0, 0]],
    ["#ffffff", [0, 0, 100]],
  ] as const) {
    let color = ColorModel.fromHex(hex).withSpace("hsl");
    assert.deepStrictEqual(color.channels, [...expected]);
    assert.strictEqual(color.hex, hex);
    color = color.withSpace("rgb");
    assert.strictEqual(color.hex, hex);
  }
});

test("changing space preserves arbitrary colors and programmatic updates retain the selected space", () => {
  for (const hex of ["#88432d", "#236b62", "#445b99", "#808080", "#010203", "#fefdfc"]) {
    for (const space of ["hsl", "hwb"] as ColorSpace[]) {
      let color = ColorModel.fromHex(hex).withSpace(space);
      assert.strictEqual(color.hex, hex);
      color = color.withHex("#236b62");
      assert.strictEqual(color.space, space);
      assert.strictEqual(color.hex, "#236b62");
      color = color.withSpace("rgb");
      assert.deepStrictEqual(color.channels.map(Math.round), [35, 107, 98]);
    }
  }
});

test("HWB normalizes excess white plus black, and the HSV plane works in every editing space", () => {
  let color = ColorModel.fromHex("#ff8000");
  assert.deepStrictEqual(color.hsv.map(Math.round), [30, 100, 100]);
  color = color.withSpace("hwb");
  assert.deepStrictEqual(color.channels.map(Math.round), [30, 0, 0]);
  color = color.withChannel(1, 80).withChannel(2, 80);
  assert.strictEqual(color.hex, "#808080");
  for (const space of ["rgb", "hsl", "hwb"] as ColorSpace[]) {
    color = color.withSpace(space).withHsv(120, 100, 100);
    assert.strictEqual(color.hex, "#00ff00");
    assert.deepStrictEqual(color.hsv.map(Math.round), [120, 100, 100]);
    color = color.withHsv(240, 0, 50);
    assert.strictEqual(color.hex, "#808080");
  }
});

test("channels vary independently and invalid hex input leaves the color intact", () => {
  let color = ColorModel.fromHex("#000000").withChannel(0, 255);
  assert.strictEqual(color.hex, "#ff0000");
  color = color.withSpace("hsl").withChannel(0, 360);
  assert.strictEqual(color.hex, "#ff0000");
  color = color.withChannel(2, 25);
  assert.strictEqual(color.hex, "#800000");
  for (const value of ["red", "#abc", "#gg0000", "#12345678"]) {
    assert.throws(() => color.withHex(value), /six-digit hex/);
    assert.strictEqual(color.hex, "#800000");
  }
});

test("updates leave previous color values unchanged", () => {
  const original = ColorModel.fromHex("#5979e8");
  const snapshot = [original.space, ...original.channels];
  const changes = [original.withChannel(0, 255), original.withHex("#26a68c"), original.withSpace("hwb"), original.withHsv(0, 100, 100)];
  assert.deepStrictEqual([original.space, ...original.channels], snapshot);
  assert.strictEqual(original.hex, "#5979e8");
  for (const changed of changes) assert.notStrictEqual(changed, original);
});
