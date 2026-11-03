import assert from "node:assert/strict";
import { test } from "node:test";
import { ringPoint, ringPosition, planePoint } from "./geometry.ts";

test("the hue ring starts at the top and runs clockwise", () => {
  for (const [hue, x, y] of [
    [0, 0.5, 0],
    [90, 1, 0.5],
    [180, 0.5, 1],
    [270, 0, 0.5],
  ]) {
    assert.strictEqual(ringPoint(x, y).hue, hue);
    assert.strictEqual(ringPoint(x, y).radius, 0.5);
    const position = ringPosition(hue);
    const point = ringPoint(position.x / 100, position.y / 100);
    assert.ok(Math.abs(point.radius - 0.44) < 1e-10);
    assert.ok(Math.abs(point.hue - hue) < 1e-10);
  }
});

test("the plane maps white to pure hue horizontally and brightness vertically, clamping dragged points", () => {
  assert.deepStrictEqual(planePoint(0, 0), { saturation: 0, value: 100 });
  assert.deepStrictEqual(planePoint(1, 1), { saturation: 100, value: 0 });
  assert.deepStrictEqual(planePoint(0.5, 0.25), { saturation: 50, value: 75 });
  assert.deepStrictEqual(planePoint(-1, 2), { saturation: 0, value: 0 });
  assert.deepStrictEqual(planePoint(2, -1), { saturation: 100, value: 100 });
});
