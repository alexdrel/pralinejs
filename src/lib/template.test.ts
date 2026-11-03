import assert from "node:assert/strict";
import { test } from "node:test";
import { fillTemplate } from "./template.ts";

test("content placeholders expand text, a node, a list, and an empty list in order", () => {
  const source = [["p", {}, "Before {{text}} {{node}} {{list}}{{empty}} after"]] as const;
  const result = fillTemplate(source, [{ text: "Text", node: ["b", {}, "Bold"], list: [["i", {}, "Italic"], "!"], empty: [] }]);
  assert.deepEqual(result, [["p", {}, "Before ", "Text", " ", ["b", {}, "Bold"], " ", ["i", {}, "Italic"], "!", " after"]]);
});

test("attribute placeholders substitute strings and bind handlers and initializers to their source", () => {
  const params = {
    key: "Ctrl",
    clicks: 0,
    initialized: false,
    click() {
      this.clicks++;
    },
    init() {
      this.initialized = true;
    },
  };
  const [node] = fillTemplate([["button", { title: "Use {{key}}", onClick: "{{click}}", $init: "{{init}}", ref: "{{action}}" }]], [params]);
  assert.ok(typeof node !== "string");
  const { title, ref, onClick, $init } = node[1];
  assert.equal(title, "Use Ctrl");
  assert.equal(ref, "{{action}}");
  assert.ok(typeof onClick === "function" && typeof $init === "function");
  (onClick as () => void)();
  ($init as () => void)();
  assert.equal(params.clicks, 1);
  assert.equal(params.initialized, true);
});

test("substitution leaves reusable input, comments, and embedded template contents unchanged", () => {
  const source = [["div", {}, "{{text}}", ["$comment", {}, "{{ignored}}"], ["template", { ref: "{{row}}" }, ["b", {}, "{{later}}"]]]] as const;
  const before = structuredClone(source);
  const result = fillTemplate(source, [{ text: "<b>{{literal}}</b>" }]);
  assert.deepEqual(result, [["div", {}, "<b>{{literal}}</b>", ["$comment", {}, "{{ignored}}"], ["template", { ref: "{{row}}" }, ["b", {}, "{{later}}"]]]]);
  assert.deepEqual(source, before);
});

test("missing and incorrectly typed parameters report their position", () => {
  assert.throws(() => fillTemplate(["{{body}}"], [{}]), /Missing template parameter: body/);
  assert.throws(() => fillTemplate(["{{body}}"], [{ body: () => {} }]), /Content parameter body must be text or JSONML/);
  assert.throws(() => fillTemplate([["div", { title: "{{label}}" }]], [{ label: ["b", {}, "Label"] }]), /Attribute parameter label must be a string/);
  assert.throws(() => fillTemplate([["div", { title: "Use {{label}}" }]], [{ label: () => {} }]), /Embedded attribute parameter label must be a string/);
  assert.throws(() => fillTemplate([["button", { onClick: "{{click}}" }]], [{ click: "wrong" }]), /Attribute parameter click must be callable/);
});
