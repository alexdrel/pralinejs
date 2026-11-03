import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { materialize, type Blueprint } from "./materialize.ts";
import { type TemplateAnchor } from "./template-anchor.ts";

type Refs = {
  host: HTMLDivElement;
  items: HTMLTemplateElement & TemplateAnchor<{ value: string }>;
};

const blueprint = [
  [
    "div",
    { id: "host", ref: "{{host}}" },
    ["i", {}, "before"],
    ["template", { id: "items", ref: "{{items}}" }, ["b", {}, "{{value}}"], ["em", {}, "!"]],
    ["i", {}, "after"],
  ],
] as unknown as Blueprint<{ items?: readonly { value: string }[] }, Refs>;

function liveText(host: Element): string {
  return [...host.childNodes]
    .filter((node) => node.nodeName !== "TEMPLATE")
    .map((node) => node.textContent)
    .join("");
}

test("initial population returns optional one-shot arrays of instance refs", () => {
  const document = new Window().document as unknown as Document;
  const nodes = [["div", {}, ["template", { ref: "{{items}}" }, ["span", { ref: "{{label}}" }, "{{text}}"]]]] as const;
  const omitted = materialize(nodes, {}, document);
  assert.equal(Object.hasOwn(omitted, "itemsRefs"), false);
  const empty = materialize(nodes, { items: [] }, document);
  assert.deepEqual(empty.itemsRefs, []);
  const populated = materialize(nodes, { items: [{ text: "one" }, { text: "two" }] }, document);
  const items = populated.itemsRefs as { label: HTMLSpanElement }[];
  assert.deepEqual(
    items.map((row) => row.label.textContent),
    ["one", "two"],
  );
  assert.equal(items[0].label, populated.fragment.querySelector("span"));
  assert.notEqual(items[0], items[1]);
  const anchor = populated.refs.items as HTMLTemplateElement & TemplateAnchor<{ text: string }, { label: HTMLSpanElement }>;
  const appended = anchor.appendItems([{ text: "three" }]);
  assert.equal(appended[0].label.textContent, "three");
  assert.equal(items.length, 2);
  const prepended = anchor.prependItems([{ text: "first" }]);
  assert.equal(prepended[0].label.textContent, "first");
  const replaced = anchor.replaceItems([{ text: "replacement" }]);
  assert.equal(replaced[0].label.textContent, "replacement");
  assert.notEqual(appended, replaced);
  assert.equal(items.length, 2);
  assert.equal(items[0].label.parentNode, null);
  assert.equal(items[0].label.textContent, "one");
  const second = materialize(nodes, { items: [{ text: "other" }] }, document);
  assert.notEqual((second.itemsRefs as { label: Element }[])[0].label, items[0].label);
  assert.equal(Object.hasOwn(omitted, "itemsRefs"), false);
});

test("dotted template names create result groups only when populated", () => {
  const document = new Window().document as unknown as Document;
  const nodes = [["template", { ref: "{{menu.rows}}" }, ["button", { ref: "{{action}}" }, "{{label}}"]]] as const;
  const omitted = materialize(nodes, {}, document);
  assert.equal(Object.hasOwn(omitted, "menu"), false);
  const result = materialize(nodes, { menu: { rows: [{ label: "Open" }] } }, document);
  const menu = result.menu as { rowsRefs: { action: HTMLButtonElement }[] };
  assert.equal(menu.rowsRefs[0].action.textContent, "Open");
  assert.equal(menu.rowsRefs[0].action, result.fragment.querySelector("button"));
});

test("append/prepend operate within the chosen region; replace removes all nodes in that region", () => {
  const document = new Window().document as unknown as Document;
  const { refs } = materialize(blueprint, {}, document);
  refs.items.appendItems([{ value: "one" }]);
  assert.equal(liveText(refs.host), "beforeafterone!");
  refs.items.prependItems([{ value: "two" }]);
  assert.equal(liveText(refs.host), "beforetwo!afterone!");
  refs.items.replaceItems([{ value: "three" }]);
  assert.equal(liveText(refs.host), "beforethree!");
  refs.items.appendItems([{ value: "up" }], true);
  assert.equal(liveText(refs.host), "beforeup!three!");
  refs.items.prependItems([{ value: "first" }], true);
  assert.equal(liveText(refs.host), "first!beforeup!three!");
  refs.items.replaceItems([{ value: "only" }], true);
  assert.equal(liveText(refs.host), "only!three!");
  assert.equal(refs.items.content.querySelector("b")?.textContent, "{{value}}");
});

test("a removed anchor retains its parent as the whole-content destination", () => {
  const document = new Window().document as unknown as Document;
  const { refs } = materialize(blueprint, {}, document);
  refs.host.replaceChildren("replacement");
  assert.equal(refs.items.parentNode, null);
  refs.items.replaceItems([{ value: "new" }]);
  refs.items.appendItems([{ value: "last" }]);
  refs.items.prependItems([{ value: "first" }]);
  assert.equal(liveText(refs.host), "first!new!last!");
  refs.items.replaceItems([]);
  assert.equal(refs.host.childNodes.length, 0);
});

test("initial data is scoped to each materialization and later populations remain independent", () => {
  const document = new Window().document as unknown as Document;
  const first = materialize(blueprint, { items: [{ value: "A" }, { value: "B" }] }, document);
  const second = materialize(blueprint, { items: [{ value: "C" }] }, document);
  assert.equal(liveText(first.refs.host), "beforeafterA!B!");
  assert.equal(liveText(second.refs.host), "beforeafterC!");
  first.refs.items.replaceItems([{ value: "{{literal}}" }]);
  assert.equal(liveText(first.refs.host), "before{{literal}}!");
  assert.equal(liveText(second.refs.host), "beforeafterC!");
});

test("embedded event and initialization parameters run only for populated instances", () => {
  const document = new Window().document as unknown as Document;
  let initialized = 0;
  let clicks = 0;
  const { refs } = materialize(
    [["div", {}, ["template", { id: "items", ref: "{{items}}" }, ["button", { $init: "{{init}}", onClick: "{{click}}" }, "Go"]]]] as unknown as Blueprint<
      object,
      { items: HTMLTemplateElement & TemplateAnchor<{ init: (element: Element) => void; click: () => void }> }
    >,
    {},
    document,
  );
  refs.items.appendItems([{ init: () => initialized++, click: () => clicks++ }]);
  assert.equal(initialized, 1);
  (refs.items.nextSibling as HTMLButtonElement).click();
  assert.equal(clicks, 1);
});

test("rows override shared parameters, including handlers, on initial and later population", () => {
  const document = new Window().document as unknown as Document;
  const clicks: string[] = [];
  type Row = { value: string; label: string; click: () => void };
  const nodes = [["div", {}, ["template", { id: "items", ref: "{{items}}" }, ["button", { title: "{{label}}", onClick: "{{click}}" }, "{{value}}"]]]] as const;
  const { refs } = materialize(
    nodes,
    [
      { label: "Shared label", click: () => clicks.push("shared") },
      { items: [{ value: "A" }, { value: "B", label: "Row label", click: () => clicks.push("row") }] },
    ],
    document,
  );
  const items = refs.items as HTMLTemplateElement & TemplateAnchor<Row>;
  const parent = items.parentElement!;
  const buttons = parent.querySelectorAll("button");
  assert.equal(buttons[0].title, "Shared label");
  assert.equal(buttons[1].title, "Row label");
  buttons[0].click();
  buttons[1].click();
  items.replaceItems([{ value: "C" }]);
  const replacement = parent.querySelector("button")!;
  assert.equal(replacement.textContent, "C");
  assert.equal(replacement.title, "Shared label");
  replacement.click();
  assert.deepEqual(clicks, ["shared", "row", "shared"]);
  assert.throws(() => items.replaceItems([{}]), /Missing template parameter: value/);
});

test("template rows preserve shared and row instance receivers, including later updates", () => {
  const document = new Window().document as unknown as Document;
  class Row {
    clicks = 0;
    get value() {
      return "Row";
    }
    click() {
      this.clicks++;
    }
  }
  class Component {
    clicks = 0;
    items: object[] = [{ value: "Initial" }, new Row()];
    get label() {
      return "Shared";
    }
    click() {
      this.clicks++;
    }
  }
  const component = new Component();
  const row = component.items[1] as Row;
  const nodes = [["div", {}, ["template", { id: "items", ref: "{{items}}" }, ["button", { title: "{{label}}", onClick: "{{click}}" }, "{{value}}"]]]] as const;
  const { refs } = materialize(
    nodes as unknown as Blueprint<{ items: readonly object[] }, { items: HTMLTemplateElement & TemplateAnchor<{ value: string; click: () => void }> }>,
    component,
    document,
  );
  const buttons = refs.items.parentElement!.querySelectorAll("button");
  buttons[0].click();
  buttons[1].click();
  assert.equal(buttons[1].textContent, "Row");
  assert.equal(buttons[1].title, "Shared");
  assert.equal(component.clicks, 1);
  assert.equal(row.clicks, 1);
  refs.items.replaceItems([{ value: "Later" }]);
  refs.items.parentElement!.querySelector("button")!.click();
  assert.equal(component.clicks, 2);
});
