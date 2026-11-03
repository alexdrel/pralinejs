import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHtml } from "./index.ts";
import { helperTypes, templateTypeName } from "./types.ts";

test("template type names capitalize the first character of each authored segment", () => {
  assert.equal(templateTypeName("channels"), "Channels");
  assert.equal(templateTypeName("menu.themeItem"), "Menu.ThemeItem");
  assert.equal(templateTypeName("SVG.option"), "SVG.Option");
});

function helpers(source: string): string {
  return helperTypes(parseHtml(source), "embed").join("\n");
}

test("shared type blocks are self-contained and omit unused helpers", () => {
  const output = helpers("<div>Static</div>");
  assert.match(output, /type Attrs =/);
  assert.match(output, /type XMLChild =/);
  assert.match(output, /type Blueprint</);
  assert.doesNotMatch(output, /\bimport\b|\bexport\b|\/\/\/|HtmlElement|SvgElement|MathElement|DomEvent|TemplateAnchor|ParamContent/);
});

test("import mode selects public helpers without embedding their private dependencies", () => {
  const output = helperTypes(parseHtml('<button ref="{{action}}" onClick="{{click}}">{{label}}</button>'), "import").join("\n");
  assert.equal(output, 'import type { Blueprint, HtmlElement, DomEvent, ParamContent } from "@alexdrel/pralinejs";\n');
  assert.doesNotMatch(output, /Attrs|XMLChild|EventHandlers|ParamAttrs|type Blueprint</);
});

test("element helpers follow recorded ref, ID, and initialization namespaces", () => {
  assert.match(helpers('<button ref="{{button}}"></button>'), /type HtmlElement</);
  assert.match(helpers('<svg><circle id="dot"/></svg>'), /type SvgElement</);
  assert.match(helpers('<math><mi $init="{{prepare}}">x</mi></math>'), /type MathElement</);
  assert.doesNotMatch(helpers("<svg><circle/></svg>"), /type SvgElement</);
});

test("event helpers are needed for event uses, not initialization alone", () => {
  assert.match(helpers('<button onClick="{{click}}"></button>'), /type DomEvent</);
  assert.doesNotMatch(helpers('<button $init="{{prepare}}"></button>'), /type DomEvent</);
});

test("content helpers include their dependencies only when the parameter accepts JML", () => {
  const output = helpers("<p>{{body}}</p>");
  for (const name of ["EventHandlers", "ParamAttrs", "ParamNode", "ParamContent"]) assert.match(output, new RegExp(`type ${name} =`));
  assert.doesNotMatch(helpers('<p title="{{body}}">{{body}}</p>'), /type ParamContent =/);
});

test("anchor helpers follow emitted contracts, excluding a discarded named-only root", () => {
  assert.match(helpers('<div><template ref="{{row}}"><b>Static</b></template></div>'), /interface TemplateAnchor</);
  assert.doesNotMatch(helpers('<template ref="{{row}}"><b>Static</b></template>'), /interface TemplateAnchor</);
  assert.match(helpers('<template ref="{{parent}}"><template ref="{{child}}"><b>Static</b></template></template>'), /interface TemplateAnchor</);
});
