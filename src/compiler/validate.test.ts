import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHtml, validate } from "./index.ts";

test("capitalized template namespaces reject ambiguous names and root contract collisions", () => {
  for (const names of [
    ["channels", "Channels"],
    ["menu.item", "Menu.other"],
    ["menu.item", "menu.Item"],
  ]) {
    const source = names.map((name) => `<template ref="{{${name}}}"><span ref="{{label}}"></span></template>`).join("");
    assert.throws(() => validate(parseHtml(source)), /Template type namespace collision/);
  }
  for (const name of ["params", "templates", "blueprint", "htmlElement"]) {
    assert.throws(() => validate(parseHtml(`<template ref="{{${name}}}"></template>`)), /cannot be exported as a TypeScript name/);
  }
  assert.doesNotThrow(() => validate(parseHtml('<template ref="{{menu.item}}"></template><template ref="{{menu.other}}"></template>')));
});

test("template names cannot collide with materialization result fields", () => {
  for (const name of ["fragment", "refs", "ids", "fragment.rows", "refs.rows", "ids.rows"]) {
    assert.throws(() => validate(parseHtml(`<template ref="{{${name}}}"></template>`)), /Template name conflicts with materialization result/);
  }
  assert.throws(
    () => validate(parseHtml('<template ref="{{row}}"><template ref="{{refs}}"></template></template>')),
    /Template name conflicts with materialization result/,
  );
  assert.doesNotThrow(() => validate(parseHtml('<div ref="{{refs}}"></div><template ref="{{menu.refs}}"></template>')));
});

test("suffixed template results cannot collide with dotted result groups", () => {
  for (const names of [
    ["item", "itemRefs.child"],
    ["itemRefs.child", "item"],
  ]) {
    const source = names.map((name) => `<template ref="{{${name}}}"></template>`).join("");
    assert.throws(() => validate(parseHtml(source)), /Template result path collision/);
  }
});

test("script and style content parameters require local explicit permission", () => {
  for (const tag of ["script", "style"]) {
    assert.throws(() => validate(parseHtml(`<${tag}>{{content}}</${tag}>`)), /require unsafe-content-params/);
    assert.throws(() => validate(parseHtml(`<div unsafe-content-params><${tag}>{{content}}</${tag}></div>`)), /require unsafe-content-params/);
    assert.throws(() => validate(parseHtml(`<template ref="{{row}}"><${tag}>{{content}}</${tag}></template>`)), /require unsafe-content-params/);
    assert.doesNotThrow(() => validate(parseHtml(`<${tag} unsafe-content-params>{{content}}</${tag}>`)));
    assert.doesNotThrow(() => validate(parseHtml(`<${tag}>/* static content */</${tag}>`)));
    assert.doesNotThrow(() => validate(parseHtml(`<${tag} title="{{label}}">/* static content */</${tag}>`)));
  }
});

test("event attributes require a whole parameter, including inside named templates", () => {
  for (const value of ["alert(1)", "{{handler}};", " {{handler}}", "{{first}}{{second}}", ""]) {
    for (const markup of [`<button onClick="${value}"></button>`, `<template ref="{{row}}"><img onerror="${value}"></template>`]) {
      assert.throws(() => validate(parseHtml(markup)), /requires a whole-attribute parameter/);
    }
  }
  assert.doesNotThrow(() => validate(parseHtml('<button onClick="{{actions.click}}"></button>')));
});

test("export names reject language keywords and generated bindings without restricting ordinary refs", () => {
  for (const name of [
    "new",
    "class",
    "await",
    "yield",
    "enum",
    "null",
    "true",
    "interface",
    "eval",
    "arguments",
    "menu.new",
    "class.item",
    "Attrs",
    "XMLChild",
    "EventHandlers",
    "ParamAttrs",
    "HtmlElement",
    "DomEvent",
    "__praline",
  ]) {
    const module = parseHtml(`<template ref="{{${name}}}"><b>Text</b></template>`);
    assert.throws(() => validate(module), /Template reference cannot be exported as a TypeScript name/);
  }
  assert.doesNotThrow(() => validate(parseHtml('<div ref="{{new}}"></div>')));
  assert.doesNotThrow(() => validate(parseHtml('<template ref="{{async}}"><b>Text</b></template>')));
});

test("parsing retains duplicate occurrences and validation reports them", () => {
  const module = parseHtml('<input id="same"><textarea id="same"></textarea>');
  assert.equal(module.root.ids.fields.get("same")!.values.length, 2);
  assert.throws(() => validate(module), /Duplicate HTML id: "same"/);
});

test("semantic constraints are checked after parsing, including anonymous template contents", () => {
  const cases: [string, RegExp][] = [
    ["<p>{{label}} {{label.text}}</p>", /Declaration path collision/],
    ["<p>{{label.text}} {{label}}</p>", /Declaration path collision/],
    ['<button onClick="{{same}}">{{same}}</button>', /Incompatible uses/],
    ['<div ref="{{same}}"></div><span ref="{{same}}"></span>', /reference path collision/],
    ['<p>{{row}}</p><template ref="{{row}}"><b>Row</b></template>', /Blueprint name conflicts/],
    ['<template><input id="same"><input id="same"></template>', /Duplicate HTML id/],
    ['<template><button onClick="{{same}}">{{same}}</button></template>', /Incompatible uses/],
    ['<template ref="{{class}}"><b>Static</b></template>', /cannot be exported/],
    ['<template ref="{{row}}"><template ref="{{row.item}}"><b>Item</b></template></template>', /export path collision/],
    [
      '<template ref="{{outer}}"><template ref="{{item}}"><b>One</b></template></template><template ref="{{item}}"><b>Two</b></template>',
      /Duplicate template export/,
    ],
  ];
  for (const [source, error] of cases) {
    const module = parseHtml(source);
    assert.throws(() => validate(module), error);
  }
});

test("validation accepts compatible uses without altering the parsed model", () => {
  const module = parseHtml('<input ref="{{controls.input}}" title="{{label}}"><p>{{label}}</p><template><b>{{inner}}</b></template>');
  const before = structuredClone(module);
  validate(module);
  assert.deepEqual(structuredClone(module), before);
  assert.equal(module.root.templateContents.length, 1);
});
