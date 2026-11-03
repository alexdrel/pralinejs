import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHtml } from "./index.ts";

test("parsing records native element facts and parameter uses", () => {
  const module = parseHtml('<svg><a id="link" ref="{{link}}" $init="{{prepare}}" onClick="{{activate}}">{{label}}</a></svg>');
  const link = module.root.refs.fields.get("link")!.values[0];
  const id = module.root.ids.fields.get("link")!.values[0];
  assert.ok(link.kind === "element" && id.kind === "element");
  assert.deepEqual(link.element, { tag: "a", namespace: "svg" });
  assert.equal(id.element, link.element);
  assert.deepEqual(module.root.params.fields.get("prepare")!.values, [{ kind: "parameter", uses: [{ kind: "init", element: link.element }] }]);
  assert.deepEqual(module.root.params.fields.get("activate")!.values, [{ kind: "parameter", uses: [{ kind: "event", name: "click" }] }]);
  assert.deepEqual(module.root.params.fields.get("label")!.values, [{ kind: "parameter", uses: [{ kind: "content" }] }]);
});

test("parsing retains template names independently of output-language restrictions", () => {
  const module = parseHtml('<template ref="{{class}}"><b>Static</b></template>');
  assert.deepEqual([...module.blueprints.keys()], ["class"]);
});

test("blueprints own their contracts and native template contents", () => {
  const module = parseHtml('<div>{{title}}<template ref="{{row}}"><span>{{label}}</span><template ref="{{cell}}"><b>{{text}}</b></template></template></div>');
  const row = module.blueprints.get("row")!;
  const cell = module.blueprints.get("cell")!;
  assert.equal(module.root.blueprints.get("row"), row);
  assert.equal(row.blueprints.get("cell"), cell);
  assert.deepEqual(module.root.templateContents, [row]);
  assert.deepEqual(row.templateContents, [cell]);
  assert.deepEqual(module.root.params.fields.get("row")!.values, [{ kind: "rows", blueprint: row }]);
  assert.deepEqual(module.root.templates.fields.get("row")!.values, [{ kind: "blueprint", blueprint: row }]);
  assert.deepEqual([...module.root.params.fields.keys()], ["title", "row"]);
  assert.deepEqual([...row.params.fields.keys()], ["label", "cell"]);
  assert.deepEqual([...cell.params.fields.keys()], ["text"]);
  assert.deepEqual([...module.blueprints.keys()], ["cell", "row"]);
});

test("multiple roots, entities, comments, and native HTML attributes survive parsing", () => {
  assert.deepEqual(parseHtml("<button disabled>A &amp; B</button> <textarea> x\n y </textarea><!--note-->").root.nodes, [
    ["button", { disabled: "" }, "A & B"],
    " ",
    ["textarea", {}, " x\n y "],
    ["$comment", {}, "note"],
  ]);
});

test("whitespace condensation retains separators and non-breaking spaces", () => {
  assert.deepEqual(parseHtml("\n<div>\n  <b>A</b> \t <i>B</i>\n  text\n</div>\n").root.nodes, [
    "\n",
    ["div", {}, "\n", ["b", {}, "A"], " ", ["i", {}, "B"], "\ntext\n"],
    "\n",
  ]);
  assert.deepEqual(parseHtml("<p>Hello   world\n    next\n\n  line &nbsp; {{label}}</p>").root.nodes, [["p", {}, "Hello world\nnext\nline \u00a0 {{label}}"]]);
});

test("whitespace preservation covers built-ins, additional tags, and their template subtrees", () => {
  const source = "\n<div>\n <span></span>\n</div>\n";
  assert.deepEqual(parseHtml(source, { preserveWhitespace: true }).root.nodes, ["\n", ["div", {}, "\n ", ["span", {}], "\n"], "\n"]);
  for (const tag of ["pre", "textarea", "script", "style"]) {
    assert.deepEqual(parseHtml(`<${tag}> \n </${tag}>`, { preserveWhitespace: [] }).root.nodes, [[tag, {}, " \n "]]);
  }
  const custom = '<ascii-art>\n <span> \n </span><template ref="{{row}}">\n <b></b>\n</template></ascii-art>';
  assert.deepEqual(parseHtml(custom, { preserveWhitespace: ["ASCII-ART"] }).blueprints.get("row")!.nodes, ["\n ", ["b", {}], "\n"]);
  assert.deepEqual(parseHtml(custom).blueprints.get("row")!.nodes, ["\n", ["b", {}], "\n"]);
});

test("namespace boundaries preserve authored xmlns and HTML integration points", () => {
  assert.deepEqual(
    parseHtml('<svg xmlns="http://www.w3.org/2000/svg"><circle/><foreignObject><div>HTML</div></foreignObject></svg><math><mi>x</mi></math>').root.nodes,
    [
      [
        "svg",
        { xmlns: "http://www.w3.org/2000/svg", $xmlns: "http://www.w3.org/2000/svg" },
        ["circle", {}],
        ["foreignObject", {}, ["div", { $xmlns: "" }, "HTML"]],
      ],
      ["math", { $xmlns: "http://www.w3.org/1998/Math/MathML" }, ["mi", {}, "x"]],
    ],
  );
});

test("IDs are literal while refs and parameter paths form nested properties", () => {
  const module = parseHtml('<button id="a-b" ref="{{edit.undo}}" onClick="{{history.undo}}">{{labels.undo}}</button><span id="aB"></span>');
  assert.deepEqual([...module.root.ids.fields.keys()], ["a-b", "aB"]);
  assert.deepEqual([...module.root.refs.fields.get("edit")!.fields.keys()], ["undo"]);
  assert.deepEqual(module.root.params.fields.get("history")!.fields.get("undo")!.values, [{ kind: "parameter", uses: [{ kind: "event", name: "click" }] }]);
  assert.deepEqual(module.root.params.fields.get("labels")!.fields.get("undo")!.values, [{ kind: "parameter", uses: [{ kind: "content" }] }]);
});

test("parameterized IDs remain in JML but are not collected as static IDs", () => {
  const module = parseHtml('<input id="{{prefix}}-input" ref="{{input}}"><button id="save">Save</button>');
  assert.deepEqual([...module.root.ids.fields.keys()], ["save"]);
  assert.deepEqual(module.root.params.fields.get("prefix")!.values, [{ kind: "parameter", uses: [{ kind: "string" }] }]);
  assert.deepEqual(module.root.nodes[0], ["input", { id: "{{prefix}}-input", ref: "{{input}}" }]);
});

test("browser parsing inserts table structure and preserves raw script text", () => {
  assert.deepEqual(parseHtml("<table><tr><td>Hello</table><script>if (a < b) run()</script>").root.nodes, [
    ["table", {}, ["tbody", {}, ["tr", {}, ["td", {}, "Hello"]]]],
    ["script", {}, "if (a < b) run()"],
  ]);
});

test("anonymous template contents have their own contracts", () => {
  const module = parseHtml('<template id="row"><span id="label">{{text}}</span></template><span id="label"></span>');
  assert.deepEqual([...module.root.ids.fields.keys()], ["row", "label"]);
  assert.equal(module.root.params.size, 0);
  assert.equal(module.blueprints.size, 0);
  const content = module.root.templateContents[0];
  assert.deepEqual([...content.ids.fields.keys()], ["label"]);
  assert.deepEqual([...content.params.fields.keys()], ["text"]);
});

test("named-only detection ignores surrounding comments and whitespace, not sibling content", () => {
  assert.equal(parseHtml('\n<!-- blueprint -->\n<template id="unrelated" ref="{{row}}"><b>Static</b></template>\n').namedOnly, true);
  for (const sibling of ["<span>Sibling</span>", "Sibling text"]) {
    assert.equal(parseHtml(`<template ref="{{row}}"><b>Static</b></template>${sibling}`).namedOnly, false);
  }
});

test("malformed HTML and reference syntax fail during parsing", () => {
  assert.throws(() => parseHtml('<div id="a" id="b"></div>'), /HTML 1:\d+: duplicate-attribute/);
  assert.throws(() => parseHtml('<div ref="edit.undo"></div>'), /Invalid reference declaration/);
  assert.throws(() => parseHtml('<div ref="{{constructor.undo}}"></div>'), /Invalid reference path/);
});
