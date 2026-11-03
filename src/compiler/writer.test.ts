import assert from "node:assert/strict";
import { test } from "node:test";
import { Writer } from "./writer.ts";

test("write emits chunks and multiline text in order, including blank lines", () => {
  const out = new Writer();
  out.write("first\nsecond", "", "third");
  assert.equal(out.output, "first\nsecond\n\nthird\n");
});

test("nested blocks indent content and restore indentation for following output", () => {
  const out = new Writer();
  out.block("outer {", () => {
    out.write("first\nsecond", "");
    out.block("inner [", () => out.write("item"), "];");
    out.write("last");
  });
  out.write("after");
  assert.equal(out.output, "outer {\n  first\n  second\n\n  inner [\n    item\n  ];\n  last\n}\nafter\n");
});

test("empty blocks still emit their header and footer", () => {
  const out = new Writer();
  out.block("empty {", () => {});
  assert.equal(out.output, "empty {\n}\n");
});
