import { type Blueprint, type ParamNode } from "./types.ts";
import { fillTemplate } from "./template.ts";
import { attachTemplate } from "./template-anchor.ts";
import { parameterValue, referencePath, setReference } from "./paths.ts";

export { type Blueprint, type ParamNode } from "./types.ts";

type TemplateRefs<Templates> = {
  [Name in keyof Templates as Templates[Name] extends Blueprint ? `${Name & string}Refs` : Name]?: Templates[Name] extends Blueprint
    ? Templates[Name]["__praline"]["refs"][]
    : TemplateRefs<Templates[Name]>;
};
type Materialized<Refs, Ids, Templates = object> = { fragment: DocumentFragment; refs: Refs; ids: Ids } & TemplateRefs<Templates>;
export type BlueprintParams<B extends Blueprint> = B["__praline"]["params"];
export type BlueprintRefs<B extends Blueprint> = B["__praline"]["refs"];

/** Materialize content into the target's document, append it, and return its refs. */
export function appendChild<P extends object, R extends object, I extends object>(
  target: Element | DocumentFragment,
  nodes: Blueprint<P, R, I>,
  params: NoInfer<P | readonly Partial<P>[]>,
): R;
export function appendChild<const B extends Blueprint>(
  target: Element | DocumentFragment,
  nodes: B & NoInfer<object extends BlueprintParams<B> ? unknown : never>,
  params?: undefined,
): BlueprintRefs<B>;
export function appendChild(
  target: Element | DocumentFragment,
  nodes: Iterable<ParamNode> & { __praline?: never },
  params?: object | readonly object[],
): Record<string, unknown>;
export function appendChild(target: Element | DocumentFragment, nodes: Iterable<ParamNode>, params: object | readonly object[] = {}): object {
  const { fragment, refs } = materialize(nodes, params, target.ownerDocument);
  target.appendChild(fragment);
  return refs;
}

/** One source supplies Params; multiple sources each supply Partial<Params>. */
export function materialize<P extends object, R extends object, I extends object, T extends object>(
  nodes: Blueprint<P, R, I, T>,
  params: NoInfer<P | readonly Partial<P>[]>,
  owner?: Document,
): Materialized<R, I, T>;

/** Parameters may be omitted only when an empty source satisfies the template. */
export function materialize<const B extends Blueprint>(
  nodes: B & NoInfer<object extends BlueprintParams<B> ? unknown : never>,
  params?: undefined,
  owner?: Document,
): Materialized<BlueprintRefs<B>, B["__praline"]["ids"], B["__praline"]["templates"]>;

/** Raw JML remains available without a generated contract. */
export function materialize(
  nodes: Iterable<ParamNode> & { __praline?: never },
  params?: object | readonly object[],
  owner?: Document,
): Materialized<Record<string, unknown>, Record<string, Element>> & Record<string, unknown>;

export function materialize(
  nodes: Iterable<ParamNode>,
  params: object | readonly object[] = {},
  owner: Document = document,
): Materialized<object, object> & Record<string, unknown> {
  const sources: readonly object[] = Array.isArray(params) ? params : [params];
  const refs: Record<string, unknown> = Object.create(null);
  const ids: Record<string, Element> = Object.create(null);
  const templates: (() => void)[] = [];

  function create(node: ParamNode, namespace = "", inParamContent = false): Node {
    if (typeof node === "string") return owner.createTextNode(node);
    const [tag, attrs, ...children] = node;
    if (tag === "$comment") return owner.createComment(children.join(""));
    if (tag === "$cdata") throw new Error("CDATA is not supported in HTML fragments.");

    namespace = attrs.$xmlns ?? namespace;
    const element = namespace === "" ? owner.createElement(tag) : owner.createElementNS(namespace, tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (name === "ref" || name === "$xmlns" || name === "unsafe-content-params") continue;
      if (inParamContent && name === "$init") continue;
      if (name.startsWith("on") && name.length > 2) {
        if (inParamContent) continue;
        if (typeof value !== "function") throw new Error(`Event attribute ${name} must be callable.`);
      }
      if (typeof value === "function") {
        if (inParamContent) continue;
        if (name === "$init") continue;
        if (!name.startsWith("on") || name.length === 2) throw new Error(`Unknown construction hook: ${name}`);
        const event = name[2].toLowerCase() + name.slice(3);
        element.addEventListener(event, value as EventListener);
        continue;
      }
      if (value === undefined || value === false) continue;
      const text = value === true ? "" : String(value);
      element.setAttribute(name, text);
    }
    const id = element.id;
    if (id && !inParamContent) {
      if (Object.hasOwn(ids, id)) throw new Error(`Duplicate HTML id: ${JSON.stringify(id)}`);
      ids[id] = element;
    }
    if (!inParamContent && typeof attrs.ref === "string") setReference(refs, referencePath(attrs.ref), element);

    const template = namespace === "" && tag === "template";
    const target = template ? (element as HTMLTemplateElement).content : element;
    for (const child of children) target.appendChild(create(child, namespace, inParamContent || template));
    if (template && !inParamContent) {
      templates.push(() => {
        const anchor = attachTemplate(element as HTMLTemplateElement, children, sources, owner);
        const path = typeof attrs.ref === "string" ? referencePath(attrs.ref) : undefined;
        const name = path?.join(".");
        const rows = name ? parameterValue(sources, name, false) : undefined;
        if (rows !== undefined) {
          if (!Array.isArray(rows)) throw new Error(`Template ${name} requires an array of parameter objects.`);
          const refPath = [...path!];
          refPath[refPath.length - 1] += "Refs";
          setReference(result, refPath, anchor.appendItems(rows));
        }
      });
    }
    if (!inParamContent && typeof attrs.$init === "function") attrs.$init(element);
    return element;
  }

  const fragment = owner.createDocumentFragment();
  const result: Materialized<object, object> & Record<string, unknown> = { fragment, refs, ids };
  for (const node of fillTemplate(nodes, sources)) fragment.appendChild(create(node));
  for (const initialize of templates) initialize();
  return result;
}
