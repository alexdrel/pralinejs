import { appendChild, type ParamNode } from "./materialize.ts";

export { type TemplateAnchor } from "./types.ts";

/** Bind a reusable JSONML blueprint to this native template's location. */
export function attachTemplate(anchor: HTMLTemplateElement, nodes: readonly ParamNode[], shared: readonly object[], owner: Document) {
  let parent = anchor.parentNode!;

  function populate(rows: readonly object[], mode: "replace" | "append" | "prepend", above: boolean) {
    if (anchor.parentNode) parent = anchor.parentNode;
    const content = owner.createDocumentFragment();
    const instances: object[] = [];
    for (const row of rows) instances.push(appendChild(content, nodes, [row, ...shared]));

    const attached = anchor.parentNode === parent;
    if (mode === "replace") {
      const siblings = [...parent.childNodes];
      const index = attached ? siblings.indexOf(anchor) : -1;
      const region = index < 0 ? siblings : above ? siblings.slice(0, index) : siblings.slice(index + 1);
      for (const node of region) parent.removeChild(node);
    }

    if (attached && above && mode !== "prepend") anchor.before(content);
    else if (attached && !above && mode !== "append") anchor.after(content);
    else if (mode === "prepend") parent.insertBefore(content, parent.firstChild);
    else parent.appendChild(content);
    return instances;
  }

  return Object.assign(anchor, {
    replaceItems(rows: readonly object[], above = false) {
      return populate(rows, "replace", above);
    },
    appendItems(rows: readonly object[], above = false) {
      return populate(rows, "append", above);
    },
    prependItems(rows: readonly object[], above = false) {
      return populate(rows, "prepend", above);
    },
  });
}
