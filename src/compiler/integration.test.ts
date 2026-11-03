import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { Window } from "happy-dom";
import { compileHtml } from "./index.ts";
import { materialize, type ParamNode, type Blueprint } from "../lib/materialize.ts";
import { type TemplateAnchor } from "../lib/template-anchor.ts";

async function template(source: string): Promise<readonly ParamNode[]> {
  const js = stripTypeScriptTypes(compileHtml(source));
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)).default;
}

test("compiled initial rows return their own refs and inherit shared bound handlers", async () => {
  const document = new Window().document as unknown as Document;
  const nodes = await template('<div><template ref="{{row}}"><button ref="{{action}}" onClick="{{click}}">{{label}}</button></template></div>');
  const shared = {
    clicks: 0,
    click() {
      this.clicks++;
    },
  };
  const result = materialize(nodes, [{ row: [{ label: "One" }, { label: "Two" }] }, shared], document);
  const rows = result.rowRefs as { action: HTMLButtonElement }[];
  assert.deepEqual(
    rows.map((row) => row.action.textContent),
    ["One", "Two"],
  );
  rows[1].action.click();
  assert.equal(shared.clicks, 1);
  assert.equal(rows[0].action, result.fragment.querySelector("button"));
});

test("parameterized IDs and their label relationships stay local to each mounted instance", async () => {
  const document = new Window().document as unknown as Document;
  const nodes = await template('<label for="{{prefix}}-input">Name</label><input id="{{prefix}}-input" ref="{{input}}">');
  for (const prefix of ["first", "second"]) {
    const { fragment, refs } = materialize(nodes, { prefix }, document);
    document.body.append(fragment);
    const input = refs.input as HTMLInputElement;
    assert.equal(input.id, `${prefix}-input`);
    assert.equal(document.getElementById(input.id), input);
    assert.equal((input.previousElementSibling as HTMLLabelElement).control, input);
  }
});

test("dotted parameters preserve method receivers and resolve a root from only one source", async () => {
  const document = new Window().document as unknown as Document;
  class History {
    count = 0;
    undo() {
      this.count++;
    }
  }
  const history = new History();
  const nodes = await template('<button ref="{{edit.undo}}" onClick="{{history.undo}}" title="Use {{keys.mod}}">{{labels.undo}}</button>');
  const { refs } = materialize(
    nodes as unknown as Blueprint<{ history: History; keys: { mod: string }; labels: { undo: string } }, { edit: { undo: HTMLButtonElement } }>,
    [{ history }, { keys: { mod: "Ctrl" }, labels: { undo: "Undo" } }],
    document,
  );
  refs.edit.undo.click();
  assert.equal(history.count, 1);
  assert.equal(refs.edit.undo.title, "Use Ctrl");
  assert.equal(refs.edit.undo.textContent, "Undo");
  assert.throws(() => materialize(nodes, [{ history: {} }, { history }, { keys: { mod: "Ctrl" } }], document), /Missing template parameter: history.undo/);
});

test("dotted shared parameters also work in embedded templates and later populations", async () => {
  const document = new Window().document as unknown as Document;
  const actions = {
    count: 0,
    select() {
      this.count++;
    },
  };
  const nodes = await template('<div><template id="row" ref="{{rows}}"><button onClick="{{actions.select}}">{{item.label}}</button></template></div>');
  const { refs } = materialize(nodes, [{ actions }], document);
  const rows = refs.rows as HTMLTemplateElement & TemplateAnchor<{ item: { label: string } }>;
  rows.appendItems([{ item: { label: "One" } }]);
  rows.parentElement!.querySelector("button")!.click();
  rows.replaceItems([{ item: { label: "Two" } }]);
  const button = rows.parentElement!.querySelector("button")!;
  assert.equal(button.textContent, "Two");
  button.click();
  assert.equal(actions.count, 2);
});

test("template ref paths drive initial population independently of IDs", () => {
  const document = new Window().document as unknown as Document;
  const nodes = [["div", {}, ["template", { id: "unrelated-id", ref: "{{menu.item}}" }, ["b", {}, "{{label}}"]]]] as const;
  type Refs = { menu: { item: HTMLTemplateElement & TemplateAnchor<{ label: string }> } };
  const params = { menu: { item: [{ label: "Initial" }] }, unrelatedId: [{ label: "Wrong" }] };
  const { refs, ids } = materialize(
    nodes as unknown as Blueprint<{ menu: { item: readonly { label: string }[] } }, Refs, { "unrelated-id": HTMLTemplateElement }>,
    params,
    document,
  );
  assert.equal(refs.menu.item, ids["unrelated-id"]);
  assert.equal(refs.menu.item.parentElement!.querySelector("b")!.textContent, "Initial");
  refs.menu.item.replaceItems([{ label: "Later" }]);
  assert.equal(refs.menu.item.parentElement!.querySelector("b")!.textContent, "Later");
  assert.throws(() => materialize(nodes, { menu: { item: "wrong" } }, document), /Template menu.item requires an array/);
});

test("compiled HTML accepts text, a node, a node list, and a native event handler", async () => {
  const window = new Window();
  const document = window.document as unknown as Document;
  const nodes = await template('<section id="body" ref="{{body}}" title="{{mod}}+K" onKeydown="{{handleKey}}">Press {{mod}}: {{help}} {{actions}}</section>');
  let key = "";
  let clicks = 0;
  const { refs } = materialize(
    nodes,
    {
      mod: "Ctrl",
      handleKey: (event: KeyboardEvent) => {
        key = event.key;
      },
      help: ["a", { href: "/help" }, "Help"],
      actions: [
        ["button", { onClick: () => clicks++ }, "Go"],
        ["span", {}, "!"],
      ],
    },
    document,
  );
  assert.equal((refs.body as Element).textContent, "Press Ctrl: Help Go!");
  assert.equal((refs.body as Element).getAttribute("title"), "Ctrl+K");
  assert.equal((refs.body as Element).hasAttribute("onkeydown"), false);
  assert.equal((refs.body as Element).querySelector("a")?.getAttribute("href"), "/help");
  ((refs.body as Element).querySelector("button") as HTMLButtonElement).click();
  (refs.body as Element).dispatchEvent(new window.KeyboardEvent("keydown", { key: "K" }) as unknown as Event);
  assert.equal(clicks, 1);
  assert.equal(key, "K");
});

test("template reuse preserves original data and supplied text is literal", async () => {
  const document = new Window().document as unknown as Document;
  const nodes = await template('<kbd id="mod" ref="{{mod}}">{{mod}}</kbd><div id="extra" ref="{{extra}}">{{extra}}</div><!-- {{ignored}} -->');
  const before = structuredClone(nodes);
  const mac = materialize(nodes, { mod: "⌘", extra: [] }, document);
  const pc = materialize(nodes, { mod: "Ctrl", extra: "<b>{{mod}}</b>" }, document);
  assert.equal((mac.refs.mod as Element).textContent, "⌘");
  assert.equal((mac.refs.extra as Element).childNodes.length, 0);
  assert.equal((pc.refs.mod as Element).textContent, "Ctrl");
  assert.equal((pc.refs.extra as Element).textContent, "<b>{{mod}}</b>");
  assert.equal((pc.refs.extra as Element).children.length, 0);
  assert.deepEqual(nodes, before);
});

test("missing parameters and values invalid for their position fail clearly", async () => {
  const document = new Window().document as unknown as Document;
  const content = await template("<div>{{content}}</div>");
  assert.throws(() => materialize(content, {}, document), /Missing template parameter: content/);
  assert.throws(() => materialize(content, { content: () => {} }, document), /must be text or JSONML/);
  const attribute = await template('<div title="{{title}}"></div>');
  assert.throws(() => materialize(attribute, { title: ["b", {}, "No"] }, document), /must be a string/);
  assert.throws(() => materialize(attribute, { title: () => {} }, document), /must be a string/);
  const handler = await template('<button onClick="{{click}}"></button>');
  assert.throws(() => materialize(handler, { click: "not a handler" }, document), /must be callable/);
  const mixed = await template('<div title="Prefix {{title}}"></div>');
  assert.throws(() => materialize(mixed, { title: () => {} }, document), /must be a string/);
});

test("authored mixed-case event names survive HTML parsing", async () => {
  const window = new Window();
  const document = window.document as unknown as Document;
  const nodes = await template('<div id="target" ref="{{target}}" onBeginEvent="{{begin}}"></div>');
  let begins = 0;
  const { refs } = materialize(nodes, { begin: () => begins++ }, document);
  (refs.target as Element).dispatchEvent(new window.Event("beginevent") as unknown as Event);
  (refs.target as Element).dispatchEvent(new window.Event("beginEvent") as unknown as Event);
  assert.equal(begins, 1);
});

test("replacing case options below a template preserves fixed options and the native select", async () => {
  const document = new Window().document as unknown as Document;
  const nodes = await template(
    '<select id="cases" ref="{{cases}}"><option value="blank">Blank</option><option value="compendium">Compendium</option><template id="case-option" ref="{{caseOption}}"><option value="{{id}}">{{label}}</option></template></select>',
  );
  const { refs } = materialize(
    nodes as unknown as Blueprint<
      object,
      {
        cases: HTMLSelectElement;
        caseOption: HTMLTemplateElement & TemplateAnchor<{ id: string; label: string }>;
      }
    >,
    {},
    document,
  );
  const blank = refs.cases.options[0];
  const compendium = refs.cases.options[1];
  refs.caseOption.replaceItems([
    { id: "one.txt", label: "One" },
    { id: "two.txt", label: "Two" },
  ]);
  assert.deepEqual(
    [...refs.cases.options].map((option) => option.textContent),
    ["Blank", "Compendium", "One", "Two"],
  );
  refs.cases.value = "two.txt";
  assert.equal(refs.cases.selectedOptions[0].textContent, "Two");
  refs.caseOption.replaceItems([{ id: "three.txt", label: "Three" }]);
  assert.equal(refs.cases.options[0], blank);
  assert.equal(refs.cases.options[1], compendium);
  assert.equal(refs.caseOption.parentNode, refs.cases);
  assert.deepEqual(
    [...refs.cases.options].map((option) => option.textContent),
    ["Blank", "Compendium", "Three"],
  );
  refs.caseOption.replaceItems([]);
  assert.equal(refs.cases.options.length, 2);
});

test("component instances supply prototype getters and handlers bound to the instance", async () => {
  const document = new Window().document as unknown as Document;
  const nodes = await template('<button id="action" ref="{{action}}" title="{{label}}" onClick="{{click}}" $init="{{init}}">Go</button>');
  class Component {
    clicks = 0;
    initialized: Element | undefined;
    get label() {
      return "Component";
    }
    click() {
      this.clicks++;
    }
    init(element: Element) {
      this.initialized = element;
    }
  }
  const first = new Component();
  const second = new Component();
  const a = materialize(nodes, first, document);
  const b = materialize(nodes, second, document);
  (a.refs.action as HTMLButtonElement).click();
  assert.equal(first.clicks, 1);
  assert.equal(second.clicks, 0);
  assert.equal(first.initialized, a.refs.action);
  assert.equal(second.initialized, b.refs.action);
  assert.equal((a.refs.action as Element).getAttribute("title"), "Component");
});
