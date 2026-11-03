import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";
import { compileHtml, type TypeMode } from "./index.ts";

const tsc = fileURLToPath(new URL("bin/tsc", import.meta.resolve("typescript/package.json")));

/** Check a small consumer against generated modules in an isolated temporary project. */
async function checkTypes(t: TestContext, format: "ts" | "dts", sources: Record<string, string>, consumer: string, types: TypeMode): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "praline-types-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "node_modules/@alexdrel"), { recursive: true });
  await symlink(fileURLToPath(new URL("../../", import.meta.url)), join(directory, "node_modules/@alexdrel/pralinejs"), "junction");
  for (const [name, html] of Object.entries(sources)) {
    const output = join(directory, `${name}.${format === "dts" ? "d.ts" : "ts"}`);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, compileHtml(html, format, { types }));
  }
  await writeFile(join(directory, "consumer.ts"), consumer);
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ESNext",
        lib: ["ESNext"],
        module: "ESNext",
        moduleResolution: "Bundler",
        types: [],
      },
      files: ["consumer.ts"],
    }),
  );
  const result = spawnSync(process.execPath, [tsc, "--project", join(directory, "tsconfig.json")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test("default exports and empty contracts have a minimal public shape", () => {
  const source = "<div>Static</div>";
  const ts = compileHtml(source, "ts");
  const dts = compileHtml(source, "dts");
  assert.match(ts, /export default \[/);
  assert.doesNotMatch(ts, /as const/);
  assert.doesNotMatch(ts, /export const nodes|interface (Params|Refs|Ids|Templates)/);
  assert.match(dts, /declare const __praline: Blueprint<object, object, object, object>;/);
  assert.match(dts, /export default __praline;/);
  assert.doesNotMatch(dts, /\["div"|as unknown as/);
});

test("a named-only blueprint has no outer default or empty namespace", () => {
  for (const format of ["ts", "dts"] as const) {
    const output = compileHtml('<template ref="{{row}}"><b>Static</b></template>', format);
    assert.match(output, /export (declare )?const row/);
    assert.doesNotMatch(output, /export default|export namespace Row|interface (Params|Refs|Ids|Templates)/);
  }
});

for (const types of ["embed", "import"] as const) {
  for (const format of ["ts", "dts"] as const) {
    test(`${format}/${types}: native refs and required parameters survive emission without an explicit DOM lib`, async (t) => {
      await checkTypes(
        t,
        format,
        { "panel.html": '<button ref="{{action}}" onClick="{{activate}}">{{label}}</button>' },
        `
import template, { type Params, type Refs } from "./panel.html.js";
const params: Params = { label: "Go", activate(event) { event.pointerId.toFixed(); } };
const refs = {} as Refs;
refs.action.disabled = true;
template.__praline.refs.action.disabled = false;
// @ts-expect-error label and activate are required.
const missing: Params = {};
// @ts-expect-error A button is not a link.
refs.action.href = "/";
`,
        types,
      );
    });

    test(`${format}/${types}: IDs retain literal spelling and omit parameterized IDs`, async (t) => {
      await checkTypes(
        t,
        format,
        { "panel.html": '<input id="{{prefix}}-input"><button id="save-btn">Save</button>' },
        `
import type { Params, Ids } from "./panel.html.js";
const params: Params = { prefix: "one" };
const ids = {} as Ids;
ids["save-btn"].disabled = true;
// @ts-expect-error Dynamic IDs have no static contract entry.
ids["one-input"];
// @ts-expect-error IDs do not acquire camelCase aliases.
ids.saveBtn;
`,
        types,
      );
    });

    test(`${format}/${types}: content parameters accept JML and attribute uses narrow them to strings`, async (t) => {
      await checkTypes(
        t,
        format,
        {
          "content.html": "<p>{{body}}</p>",
          "attribute.html": '<p title="{{label}}">{{label}}</p>',
        },
        `
import type { Params as Content } from "./content.html.js";
import type { Params as Attribute } from "./attribute.html.js";
const text: Content = { body: "Text" };
const node: Content = { body: ["button", { onClick(event) { event.pointerId.toFixed(); } }, "Go"] };
const list: Content = { body: [["b", {}, "Bold"], "Plain"] };
const attribute: Attribute = { label: "Label" };
// @ts-expect-error Attribute parameters cannot receive JML.
const invalid: Attribute = { label: ["b", {}, "Label"] };
`,
        types,
      );
    });

    test(`${format}/${types}: a reused handler retains every native event signature`, async (t) => {
      await checkTypes(
        t,
        format,
        { "panel.html": '<button onClick="{{handle}}" onKeydown="{{handle}}"></button>' },
        `
import type { Params } from "./panel.html.js";
const handle = {} as Params["handle"];
handle(new PointerEvent("click"));
handle(new KeyboardEvent("keydown"));
// @ts-expect-error The handler does not accept an arbitrary Event.
handle(new Event("unknown"));
`,
        types,
      );
    });

    test(`${format}/${types}: grouped blueprints retain their own contracts and typed anchors`, async (t) => {
      await checkTypes(
        t,
        format,
        { "panel.html": '<div>{{heading}}<template ref="{{menu.item}}"><input ref="{{input}}" title="{{value}}"></template></div>' },
        `
import template, { menu, type Menu, type Params } from "./panel.html.js";
const root: Params = { heading: "Heading" };
const row: Menu.Item.Params = { value: "One" };
const refs = {} as Menu.Item.Refs;
refs.input.value = "Edited";
template.__praline.refs.menu.item.appendItems([row]);
template.__praline.templates.menu.item.__praline.refs.input.value = "Typed";
// @ts-expect-error Row parameters do not leak into the root contract.
const wrongRoot: Params = { heading: "Heading", value: "One" };
// @ts-expect-error Row parameters remain required on the named blueprint.
const missingRow: Menu.Item.Params = {};
`,
        types,
      );
    });

    test(`${format}/${types}: named-only blueprints expose nested contracts without a default export`, async (t) => {
      await checkTypes(
        t,
        format,
        { "panel.html": '<template ref="{{parent}}"><div><template ref="{{child}}"><b ref="{{label}}">{{text}}</b></template></div></template>' },
        `
import { parent, child, type Parent, type Child } from "./panel.html.js";
import * as module from "./panel.html.js";
const params: Child.Params = { text: "One" };
const nested: Parent.Templates = { child };
parent.__praline.refs.child.replaceItems([params]);
nested.child.__praline.refs.label.textContent = "Two";
// @ts-expect-error A named-only file has no default export.
module.default;
`,
        types,
      );
    });

    test(`${format}/${types}: SVG and MathML refs and initialization targets use their native types`, async (t) => {
      await checkTypes(
        t,
        format,
        { "panel.html": '<svg><a ref="{{link}}" $init="{{prepare}}"></a></svg><math><mi ref="{{symbol}}">x</mi></math>' },
        `
import type { Params, Refs } from "./panel.html.js";
const params: Params = { prepare(link) { link.href.baseVal = "#one"; } };
const refs = {} as Refs;
refs.link.href.baseVal = "#two";
const symbol: MathMLElement = refs.symbol;
// @ts-expect-error SVG links are not HTML links.
refs.link.href = "/";
`,
        types,
      );
    });

    test(`${format}/${types}: consumer DOM maps extend custom tags and events while unknown names fall back`, async (t) => {
      await checkTypes(
        t,
        format,
        {
          "panel.html":
            '<my-widget ref="{{widget}}" $init="{{prepare}}" onPing="{{ping}}"></my-widget><unknown-widget ref="{{other}}" onMystery="{{mystery}}"></unknown-widget>',
        },
        `
import type { Params, Refs } from "./panel.html.js";
declare global {
  interface MyWidget extends HTMLElement { message: string }
  interface HTMLElementTagNameMap { "my-widget": MyWidget }
  interface GlobalEventHandlersEventMap { ping: CustomEvent<{ code: number }> }
}
const params: Params = {
  prepare(widget) { widget.message = "Ready"; },
  ping(event) { event.detail.code.toFixed(); },
  mystery(event) {
    event.preventDefault();
    // @ts-expect-error Unknown events fall back to Event.
    event.detail;
  },
};
const refs = {} as Refs;
refs.widget.message = "Custom";
refs.other.dataset.value = "Fallback";
// @ts-expect-error Unknown tags fall back to HTMLElement.
refs.other.value;
`,
        types,
      );
    });

    test(`${format}/${types}: identical HTML basenames resolve distinct contracts through .html.js imports`, async (t) => {
      await checkTypes(
        t,
        format,
        {
          "one/panel.html": '<input ref="{{input}}">',
          "two/panel.html": '<textarea ref="{{text}}"></textarea>',
        },
        `
import one from "./one/panel.html.js";
import two from "./two/panel.html.js";
one.__praline.refs.input.checked = true;
two.__praline.refs.text.rows = 3;
// @ts-expect-error Equal basenames do not mix their contracts.
two.__praline.refs.input;
`,
        types,
      );
    });

    test(`${format}/${types}: generated blueprints infer materialize parameters and returned refs`, async (t) => {
      await checkTypes(
        t,
        format,
        {
          "panel.html":
            '<button ref="{{action}}" onClick="{{click}}">{{label}}</button><template ref="{{row}}"><input ref="{{field}}" value="{{value}}"></template><template ref="{{staticRow}}"><span ref="{{label}}">Static</span></template>',
        },
        `
import { materialize } from "@alexdrel/pralinejs";
import template from "./panel.html.js";
const result = materialize(template, { label: "Go", click(event) { event.pointerId.toFixed(); }, row: [{ value: "One" }] });
result.refs.action.disabled = true;
result.refs.staticRow.appendItems([{}])[0].label.textContent = "Typed without Params";
result.rowRefs?.[0].field.value.toUpperCase();
result.refs.row.appendItems([{ value: "Appended" }])[0].field.value.toUpperCase();
result.refs.row.prependItems([{ value: "Prepended" }])[0].field.value.toUpperCase();
result.refs.row.replaceItems([{ value: "Replaced" }])[0].field.value.toUpperCase();
// @ts-expect-error Anchor return values retain native ref types.
result.refs.row.appendItems([])[0].field.href.toUpperCase();
// @ts-expect-error Initial population results are optional.
result.rowRefs[0].field.value = "Two";
// @ts-expect-error Populated refs retain native element types.
result.rowRefs?.[0].field.href.toUpperCase();
// @ts-expect-error Required inputs survive materialize inference.
materialize(template, {});
// @ts-expect-error Returned refs retain native element types.
result.refs.action.href = "/";
`,
        types,
      );
    });
  }
}
