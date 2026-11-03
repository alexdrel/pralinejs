import assert from "node:assert/strict";
import { test } from "node:test";
import { compileHtml } from "./index.ts";
import { transformWithOxc } from "vite";

async function runtime(source: string, format: "js" | "ts" = "js") {
  let code = compileHtml(source, format);
  if (format === "ts") code = (await transformWithOxc(code, "blueprint.html.ts")).code;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

test("JS groups inline independent values and bind only grouped values reused elsewhere", async () => {
  const lone = compileHtml('<template ref="{{menu.item}}"><b>Static</b></template>', "js");
  assert.match(lone, /export const menu = \{\s+item: \[/);
  assert.doesNotMatch(lone, /const __praline\d+|menu\.item =/);
  assert.doesNotMatch(compileHtml(`<div><template ref="{{menu.item}}"><b>Static</b></template></div>`, "js"), /^const __praline\d+ =/m);

  const source = '<template ref="{{menu.outer}}"><div><template ref="{{menu.inner}}"><b>Inner</b></template></div></template>';
  const output = compileHtml(source, "js");
  assert.equal([...output.matchAll(/^const __praline\d+ =/gm)].length, 1);
  assert.match(output, /export const menu = \{\s+inner: __praline\d+,\s+outer: \[/);
  const module = await runtime(source);
  assert.equal(module.menu.outer[0][2][2], module.menu.inner[0]);

  const withRoot = `<div>${source}</div>`;
  assert.equal([...compileHtml(withRoot, "js").matchAll(/^const __praline\d+ =/gm)].length, 1);
  const root = await runtime(withRoot);
  assert.equal(root.default[0][2][2], root.menu.outer[0]);
  assert.equal(root.menu.outer[0][2][2], root.menu.inner[0]);
});

test("JS reuse is independent of export grouping and private names avoid public bindings", async () => {
  const sources = [
    '<template ref="{{outer}}"><div><template ref="{{menu.inner}}"><b>Inner</b></template></div></template>',
    '<template ref="{{menu.outer}}"><div><template ref="{{inner}}"><b>Inner</b></template></div></template>',
    '<template ref="{{first.outer}}"><div><template ref="{{second.inner}}"><b>Inner</b></template></div></template>',
    '<template><template ref="{{menu.inner}}"><b>Inner</b></template></template>',
    '<div><template ref="{{__praline0}}"><b>Flat</b></template><template ref="{{menu.outer}}"><div><template ref="{{menu.item}}"><i>Grouped</i></template></div></template></div>',
  ];
  for (const source of sources) assert.deepEqual(await runtime(source), await runtime(source, "ts"));
  assert.doesNotMatch(compileHtml(sources[1], "js"), /^const __praline\d+ =/m);
  const collision = await runtime(sources[4]);
  assert.deepEqual(Object.keys(collision).sort(), ["__praline0", "default", "menu"]);
  assert.equal(collision.default[0][2][2], collision.__praline0[0]);
  assert.equal(collision.default[0][3][2], collision.menu.outer[0]);
  assert.equal(collision.menu.outer[0][2][2], collision.menu.item[0]);
  assert.match(compileHtml(sources[4], "js"), /^const __praline1 =/m);
});

test("JS emission preserves named template identity, grouped exports, and named-only modules", async () => {
  const module = await runtime('<div><template ref="{{menu.item}}"><b>{{label}}</b></template><template ref="{{menu.other}}"><i>Other</i></template></div>');
  assert.equal("nodes" in module, false);
  assert.deepEqual(module.menu.item, [["b", {}, "{{label}}"]]);
  assert.equal(module.default[0][2][2], module.menu.item[0]);
  assert.equal(module.default[0][3][2], module.menu.other[0]);
  const lone = await runtime('<template ref="{{row}}"><span>{{value}}</span></template>');
  assert.deepEqual(Object.keys(lone), ["row"]);
  assert.deepEqual(lone.row, [["span", {}, "{{value}}"]]);
  const nested = await runtime('<template ref="{{parent}}"><div><template ref="{{child}}"><b>{{label}}</b></template></div></template>');
  assert.equal(nested.parent[0][2][2], nested.child[0]);
});

test("the default blueprint does not claim a named nodes export", async () => {
  const plain = await runtime("<div>Plain</div>");
  assert.deepEqual(Object.keys(plain), ["default"]);
  const source = '<div><template ref="{{nodes}}"><b>{{label}}</b></template></div>';
  const module = await runtime(source);
  assert.deepEqual(Object.keys(module).sort(), ["default", "nodes"]);
  assert.equal(module.default[0][2][2], module.nodes[0]);
});
