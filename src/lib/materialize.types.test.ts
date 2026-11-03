// Compile-time tests, included by npm run check. These functions are never called.
import { appendChild, materialize, type Blueprint } from "./materialize.ts";

type Params = { activate: (event: PointerEvent) => void };
type Refs = { input: HTMLInputElement };
type Ids = { "input-id": HTMLInputElement };
type ItemParams = { value: string; label: string };

declare const form: Blueprint<Params, Refs, Ids>;
declare const plain: Blueprint<object, { root: HTMLDivElement }>;
declare const item: Blueprint<ItemParams, { label: HTMLSpanElement }>;
declare const list: Blueprint<{ items?: readonly Partial<ItemParams>[] }, object, object, { items: typeof item }>;
declare const nested: Blueprint<{ history: { undo: () => void } }>;
declare const grouped: Blueprint<object, object, object, { menu: { rows: typeof item } }>;

type TemplatesOf<Value> = Value extends Blueprint<infer _Params, infer _Refs, infer _Ids, infer Templates> ? Templates : never;
declare const children: TemplatesOf<typeof list>;

export function rawRefTypes(owner: Document) {
  const { refs, ids } = materialize([["button", { id: "undo", ref: "{{edit.undo}}" }]], {}, owner);
  // @ts-expect-error Raw refs may be elements or nested groups; narrow or cast before use.
  refs.edit.click();
  (refs.edit as { undo: HTMLButtonElement }).undo.click();
  ids.undo.getAttribute("id");
}

export function initialTemplateRefTypes() {
  const result = materialize(list, { items: [{ label: "One", value: "one" }] });
  result.itemsRefs?.[0].label.click();
  // @ts-expect-error Initial population arrays remain optional.
  result.itemsRefs[0].label.click();
  // @ts-expect-error Row refs retain native element types.
  result.itemsRefs?.[0].label.value.toFixed();
  // @ts-expect-error Unknown templates are not result properties.
  result.missing();
  materialize(grouped).menu?.rowsRefs?.[0].label.click();
  // @ts-expect-error A plain blueprint has no populated templates.
  materialize(plain).items();
}

export function appendTypes(target: HTMLElement) {
  appendChild(target, plain).root.textContent = "Appended";
  // @ts-expect-error Appended refs retain their native element types.
  appendChild(target, plain).root.href = "/";
  appendChild(target, form, {
    activate(event) {
      event.pointerId.toFixed();
    },
  });
  appendChild(target, form, [{ activate() {} }, {}]);
  appendChild(target, [["span", {}, "Raw JML"]]);
  // @ts-expect-error Required parameters cannot be omitted.
  appendChild(target, form);
  // @ts-expect-error A single source must supply all parameters.
  appendChild(target, form, {});
  // @ts-expect-error Provided parameter values must match.
  appendChild(target, form, [{ activate: "wrong" }]);
}

// An independently declared blueprint needs no imported contract or shared symbol.
declare const standalone: ["input", { id: string; ref: string; onClick: string }][] & {
  __praline: {
    params: Params;
    refs: Refs;
    ids: Ids;
    templates: object;
  };
};

export function standaloneTypes(owner: Document) {
  const result = materialize(standalone, { activate() {} }, owner);
  result.refs.input.value = "Inferred without Blueprint";
  result.ids["input-id"].value = "Also inferred";
  // @ts-expect-error Structural contracts still require the declared parameters.
  materialize(standalone, {});
  // @ts-expect-error Structural contracts preserve native ref types.
  result.refs.input.href = "/";
}

export function singleSourceTypes(owner: Document) {
  const result = materialize(
    form,
    {
      activate(event) {
        event.pointerId.toFixed();
      },
    },
    owner,
  );
  result.refs.input.value = "Typed refs";
  result.ids["input-id"].value = "Typed IDs";
  // @ts-expect-error Refs retain native element types.
  result.refs.input.href = "/";
  // @ts-expect-error IDs retain their literal spelling.
  result.ids.inputId.value = "";
  // @ts-expect-error Ref names come from the blueprint.
  result.refs.missing();
  // @ts-expect-error A required single source cannot be omitted.
  materialize(form);
  // @ts-expect-error An expected output type cannot make required params optional.
  const incomplete: { fragment: DocumentFragment; refs: Refs; ids: Ids } = materialize(form);
  // @ts-expect-error A single object must supply full Params.
  materialize(form, {});
  // @ts-expect-error Parameter types are checked.
  materialize(form, { activate: "wrong" });
  // @ts-expect-error Object literals check unknown parameter names.
  materialize(form, { activate() {}, typo: true });

  materialize(plain).refs.root.innerHTML = "";
  materialize(list);
  materialize(item, { value: "one", label: "One" });
  // @ts-expect-error Named blueprints follow the same complete-object rule.
  materialize(item, { label: "One" });
  materialize(children.items, { value: "one", label: "One" });
  // @ts-expect-error Only declared nested blueprints are known.
  children.missing();
  return incomplete;
}

export function multipleSourceTypes(owner: Document) {
  const result = materialize(
    form,
    [
      {
        activate(event) {
          event.pointerId.toFixed();
        },
      },
    ],
    owner,
  );
  result.refs.input.value = "Still inferred";
  result.ids["input-id"].value = "Still inferred";
  materialize(item, [{ label: "One" }, { value: "one" }]);
  // Partial sources deliberately do not prove combined completeness.
  materialize(item, [{ label: "One" }]);
  materialize(form, [{}, { activate() {} }]);
  materialize(form, []);
  const dynamic: Partial<Params>[] = [{}];
  materialize(form, dynamic);
  // @ts-expect-error Supplied fields must match Params.
  materialize(form, [{ activate: "wrong" }]);
  // @ts-expect-error Partial does not introduce new parameter names.
  materialize(form, [{ unrelated: true }]);
  // @ts-expect-error Nested objects are not made deeply partial.
  materialize(nested, [{ history: {} }]);
  // @ts-expect-error Nested template rows retain their own field types.
  materialize(list, [{ items: [{ value: 42 }] }]);
}
