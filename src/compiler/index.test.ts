import assert from "node:assert/strict";
import { test } from "node:test";
import { compileHtml } from "./index.ts";

test("all output formats validate the parsed model before emission", () => {
  for (const format of ["none", "ts", "js", "dts"] as const) {
    assert.throws(() => compileHtml('<button onClick="{{action}}">{{action}}</button>', format), /Incompatible uses/);
  }
});

test("emit none accepts valid HTML without producing module text", () => {
  assert.equal(compileHtml('<button onClick="{{action}}">{{label}}</button>', "none"), "");
});

test("typed output imports package types by default and embeds them only when requested", () => {
  for (const format of ["ts", "dts"] as const) {
    const source = '<button ref="{{action}}">Go</button>';
    const imported = compileHtml(source, format);
    assert.match(imported, /import type \{ Blueprint, HtmlElement \} from "@alexdrel\/pralinejs";/);
    assert.doesNotMatch(imported, /type Blueprint</);
    const embedded = compileHtml(source, format, { types: "embed" });
    assert.match(embedded, /type Blueprint</);
    assert.doesNotMatch(embedded, /import type/);
  }
});
