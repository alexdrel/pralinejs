import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { type XMLChild } from "@alexdrel/jsonml-ts";
import { appendChild, materialize, type ParamNode, type Blueprint } from "./materialize.ts";

test("script and style parameters require permission that never becomes a DOM attribute", () => {
  const document = new Window().document as unknown as Document;
  for (const tag of ["script", "style"]) {
    for (const attrs of [{}, { "unsafe-content-params": false }]) {
      assert.throws(() => materialize([[tag, attrs, "{{content}}"]], { content: "dynamic" }, document), /require unsafe-content-params/);
    }
    for (const permission of [true, ""]) {
      const { fragment } = materialize([[tag, { "unsafe-content-params": permission }, "{{content}}"]], { content: "dynamic" }, document);
      assert.equal(fragment.textContent, "dynamic");
      assert.equal((fragment.firstChild as Element).hasAttribute("unsafe-content-params"), false);
    }
    const { fragment } = materialize([[tag, {}, "/* static */"]], {}, document);
    assert.equal(fragment.textContent, "/* static */");
    const { refs } = materialize([["template", { ref: "{{row}}" }, [tag, {}, "{{content}}"]]], {}, document);
    assert.throws(
      () => (refs.row as HTMLTemplateElement & { appendItems(rows: object[]): void }).appendItems([{ content: "dynamic" }]),
      /require unsafe-content-params/,
    );
  }
});

test("events reject strings from markup and content parameters while accepting functions", () => {
  const document = new Window().document as unknown as Document;
  for (const value of ["alert(1)", "{{code}};", "", false, undefined]) {
    const nodes = [["button", { onClick: value }]] as unknown as ParamNode[];
    assert.throws(() => materialize(nodes, { code: "alert(1)" }, document), /Event attribute/);
  }
  assert.throws(() => materialize(["{{content}}"], { content: ["img", { onerror: "alert(1)" }] }, document), /Event attribute onerror must be callable/);
  let clicks = 0;
  const { fragment } = materialize([["button", { onClick: () => clicks++ }]], {}, document);
  (fragment.firstChild as HTMLButtonElement).click();
  assert.equal(clicks, 1);
});

test("appendChild uses the target document, preserves existing children, and installs handlers", () => {
  const document = new Window().document as unknown as Document;
  const target = document.createElement("div");
  target.textContent = "Existing";
  let clicks = 0;
  const result = appendChild(target, [["button", { ref: "{{action}}", onClick: "{{click}}" }, "{{label}}"]], {
    label: "Go",
    click: () => clicks++,
  });
  assert.equal(target.textContent, "ExistingGo");
  const button = target.querySelector("button")!;
  assert.equal(result.action, button);
  assert.equal(button.ownerDocument, document);
  assert.equal(button.hasAttribute("ref"), false);
  button.click();
  assert.equal(clicks, 1);
  const fragment = document.createDocumentFragment();
  appendChild(fragment, [["span", {}, "Fragment target"]]);
  assert.equal(fragment.firstChild?.ownerDocument, document);
  assert.equal(fragment.textContent, "Fragment target");
});

test("explicit references and literal IDs are separate instance-local collections", () => {
  const document = new Window().document as unknown as Document;
  const { refs, ids } = materialize([["div", { id: "glyph-pane", ref: "{{glyphPane}}" }]], {}, document);
  assert.equal(refs.glyphPane, ids["glyph-pane"]);
  assert.equal(refs["glyph-pane"], undefined);
  assert.equal(ids.glyphPane, undefined);
  assert.equal(refs.glyphPane.hasAttribute("ref"), false);
  assert.equal(refs.glyphPane.id, "glyph-pane");
  for (const ids of [
    ["a-b", "aB"],
    ["aB", "a-b"],
  ]) {
    const result = materialize(
      ids.map((id) => ["div", { id }] as const),
      {},
      document,
    );
    assert.equal(Object.keys(result.ids).length, 2);
    assert.equal(Object.keys(result.refs).length, 0);
  }
});

test("nested refs need no IDs, remain instance-local, and reject conflicting paths", () => {
  const document = new Window().document as unknown as Document;
  const nodes = [
    ["button", { ref: "{{edit.undo}}" }, "Undo"],
    ["button", { ref: "{{edit.redo}}" }, "Redo"],
  ] as const;
  type Refs = { edit: { undo: HTMLButtonElement; redo: HTMLButtonElement } };
  const first = materialize(nodes as unknown as Blueprint<object, Refs>, {}, document);
  const second = materialize(nodes as unknown as Blueprint<object, Refs>, {}, document);
  assert.equal(first.refs.edit.undo.textContent, "Undo");
  assert.equal(first.refs.edit.redo.textContent, "Redo");
  assert.equal(first.refs.edit.undo.id, "");
  assert.equal(Object.keys(first.ids).length, 0);
  assert.notEqual(first.refs.edit.undo, second.refs.edit.undo);
  for (const paths of [
    ["edit", "edit.undo"],
    ["edit.undo", "edit"],
    ["edit.undo", "edit.undo"],
  ]) {
    assert.throws(
      () =>
        materialize(
          paths.map((path) => ["div", { ref: `{{${path}}}` }] as const),
          {},
          document,
        ),
      /reference path collision/,
    );
  }
  assert.throws(() => materialize([["div", { ref: "{{__proto__.undo}}" }]], {}, document), /Invalid reference path/);
});

test("event attributes preserve item closures, infer native events, and keep event-name casing", () => {
  const window = new Window();
  const document = window.document as unknown as Document;
  const selected: string[] = [];
  const { fragment } = materialize(
    ["┌", "─", "┐"].map((char) => ["button", { onClick: () => selected.push(char) }, char] as const),
    {},
    document,
  );
  document.body.append(fragment);
  const buttons = document.querySelectorAll("button");
  buttons[2].click();
  buttons[0].click();
  assert.deepEqual(selected, ["┐", "┌"]);
  assert.equal(buttons[0].hasAttribute("onClick"), false);

  let key = "";
  let begins = 0;
  const { refs } = materialize(
    [
      [
        "input",
        {
          id: "input",
          ref: "{{input}}",
          onKeydown: (event) => {
            key = event.key;
          },
          onBeginEvent: () => begins++,
        },
      ],
    ],
    {},
    document,
  );
  (refs.input as Element).dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }) as unknown as Event);
  (refs.input as Element).dispatchEvent(new window.Event("beginevent") as unknown as Event);
  (refs.input as Element).dispatchEvent(new window.Event("beginEvent") as unknown as Event);
  assert.equal(key, "Enter");
  assert.equal(begins, 1);
});

test("$init runs after children exist, before mounting, and is not an attribute", () => {
  const document = new Window().document as unknown as Document;
  let initialized = false;
  materialize(
    [
      [
        "div",
        {
          $init(element) {
            assert.equal(element.textContent, "Ready");
            assert.equal(element.isConnected, false);
            assert.equal(element.hasAttribute("$init"), false);
            initialized = true;
          },
        },
        "Ready",
      ],
    ],
    {},
    document,
  );
  assert.equal(initialized, true);
});

test("mounting multiple roots preserves native references and leaves existing controls alone", () => {
  const window = new Window();
  const document = window.document as unknown as Document;
  const existing = document.createElement("textarea");
  existing.value = "Keep my editing state";
  document.body.append(existing);
  const nodes: XMLChild[] = [
    ["div", {}, ["button", { id: "toggle", ref: "{{toggle}}", type: "button" }, "Toggle"]],
    "\n",
    ["$comment", {}, "content"],
    ["div", { id: "pane", ref: "{{pane}}" }, "A & B"],
  ];
  const { fragment, refs } = materialize(nodes as unknown as Blueprint<object, { toggle: HTMLButtonElement; pane: HTMLDivElement }>, {}, document);
  assert.equal(fragment.childNodes.length, 4);
  assert.equal(refs.toggle.constructor.name, "HTMLButtonElement");
  assert.equal(refs.pane.textContent, "A & B");
  let clicks = 0;
  refs.toggle.addEventListener("click", () => clicks++);
  document.body.append(fragment);
  assert.equal(fragment.childNodes.length, 0);
  assert.equal(document.getElementById("toggle"), refs.toggle);
  refs.toggle.click();
  assert.equal(clicks, 1);
  assert.equal(existing.value, "Keep my editing state");
  const second = materialize(nodes, {}, document);
  assert.notEqual(second.refs.toggle, refs.toggle);
});

test("template descendants stay inert and do not collide with live references", () => {
  const document = new Window().document as unknown as Document;
  const { refs } = materialize(
    [
      ["template", { id: "row", ref: "{{row}}" }, ["span", { id: "label", ref: "{{label}}" }, "Template"]],
      ["span", { id: "label", ref: "{{label}}" }, "Live"],
    ],
    {},
    document,
  );
  assert.equal((refs.row as HTMLTemplateElement).content.firstChild?.textContent, "Template");
  assert.equal((refs.label as Element).textContent, "Live");
  assert.throws(
    () =>
      materialize(
        [
          ["div", { id: "x", ref: "{{x}}" }],
          ["div", { id: "x", ref: "{{x}}" }],
        ],
        {},
        document,
      ),
    /Duplicate HTML id/,
  );
});

test("explicit construction namespaces inherit and never become DOM attributes", () => {
  const document = new Window().document as unknown as Document;
  const { refs } = materialize(
    [
      [
        "svg",
        { $xmlns: "http://www.w3.org/2000/svg", xmlns: "http://www.w3.org/2000/svg" },
        ["circle", { id: "dot", ref: "{{dot}}", r: 5 }],
        ["foreignObject", {}, ["button", { $xmlns: "", id: "button", ref: "{{button}}" }]],
      ],
    ],
    {},
    document,
  );
  assert.equal((refs.dot as Element).namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal((refs.dot as Element).getAttribute("r"), "5");
  assert.equal((refs.button as Element).namespaceURI, "http://www.w3.org/1999/xhtml");
  const svg = (refs.dot as Element).parentElement!;
  assert.equal(svg.hasAttribute("$xmlns"), false);
  assert.equal(svg.getAttribute("xmlns"), "http://www.w3.org/2000/svg");
  assert.equal((refs.button as Element).hasAttribute("$xmlns"), false);
});

test("namespace selection does not guess from tags, xmlns attributes, or prefixes", () => {
  const document = new Window().document as unknown as Document;
  const { fragment } = materialize(
    [
      ["svg", { xmlns: "http://www.w3.org/2000/svg" }, ["circle", {}]],
      ["item", { $xmlns: "urn:example" }, ["child", {}]],
      ["span", { "xlink:href": "#target", "xml:lang": "en" }],
    ],
    {},
    document,
  );
  const [svg, item, span] = [...fragment.children];
  assert.equal(svg.namespaceURI, "http://www.w3.org/1999/xhtml");
  assert.equal(svg.firstElementChild!.namespaceURI, "http://www.w3.org/1999/xhtml");
  assert.equal(item.namespaceURI, "urn:example");
  assert.equal(item.firstElementChild!.namespaceURI, "urn:example");
  assert.equal(span.getAttributeNode("xlink:href")!.namespaceURI, null);
  assert.equal(span.getAttributeNode("xml:lang")!.namespaceURI, null);
  assert.equal(span.namespaceURI, "http://www.w3.org/1999/xhtml");
});

test("a single-use iterable preserves root order, parameter expansion, refs, and handlers", () => {
  const document = new Window().document as unknown as Document;
  let iterations = 0;
  let clicks = 0;
  const input: Iterable<ParamNode> = {
    *[Symbol.iterator]() {
      assert.equal(++iterations, 1);
      yield "Before ";
      yield ["button", { id: "action", ref: "{{action}}", onClick: "{{click}}" }, "{{label}}"];
      yield " {{after}}";
    },
  };
  const { fragment, refs } = materialize(input, { label: "Go", after: "after", click: () => clicks++ }, document);
  assert.equal(iterations, 1);
  assert.equal(fragment.textContent, "Before Go after");
  assert.equal(fragment.childNodes[1], refs.action);
  (refs.action as HTMLButtonElement).click();
  assert.equal(clicks, 1);
});
