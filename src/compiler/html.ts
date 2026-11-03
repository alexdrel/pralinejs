import { type DefaultTreeAdapterTypes, html, parseFragment } from "parse5";
import { type ReadonlyXmlElement, type XMLChild, xmlComment, xmlElement } from "@alexdrel/jsonml-ts";
import { placeholders } from "../lib/template.ts";
import { referencePath } from "../lib/paths.ts";
import { Blueprint, type ElementInfo, type HtmlModule } from "./model.ts";

type ParsedNode = DefaultTreeAdapterTypes.ChildNode;
type ParsedElement = DefaultTreeAdapterTypes.Element | DefaultTreeAdapterTypes.Template;

export interface CompileOptions {
  /** Preserve all whitespace, or preserve additional tags alongside pre, textarea, script, and style. Default: false. */
  preserveWhitespace?: boolean | readonly string[];
}

function condenseWhitespace(children: ParsedNode[], preserveWhitespace: CompileOptions["preserveWhitespace"] = false): void {
  if (preserveWhitespace === true) return;
  const preservedTags = new Set(["pre", "textarea", "script", "style"]);
  if (Array.isArray(preserveWhitespace)) {
    for (const tag of preserveWhitespace) preservedTags.add(tag.toLowerCase());
  }
  function visit(children: ParsedNode[]): void {
    for (const node of children) {
      if ("value" in node) {
        node.value = node.value.replace(/[\t\n\f\r ]+/g, (whitespace) => (/[\r\n]/.test(whitespace) ? "\n" : " "));
      } else if ("tagName" in node && !preservedTags.has(node.tagName.toLowerCase())) {
        const parent = "content" in node ? node.content : node;
        visit(parent.childNodes);
      }
    }
  }
  visit(children);
}

export class HtmlParser {
  source: string;
  blueprints = new Map<string, Blueprint>();
  templateNames = new Map<ReadonlyXmlElement, string>();

  constructor(source: string) {
    this.source = source;
  }

  parse(options: CompileOptions): HtmlModule {
    const fragment = parseFragment(this.source, {
      sourceCodeLocationInfo: true,
      onParseError(error) {
        throw new Error(`HTML ${error.startLine}:${error.startCol}: ${error.code}`);
      },
    });
    condenseWhitespace(fragment.childNodes, options.preserveWhitespace);
    const root = this.blueprint(fragment.childNodes);
    const roots = root.nodes.filter((node) => (typeof node === "string" ? node.trim() !== "" : node[0] !== "$comment"));
    const namedOnly = roots.length === 1 && typeof roots[0] !== "string" && this.templateNames.has(roots[0]);
    return { root, blueprints: this.blueprints, templateNames: this.templateNames, namedOnly };
  }

  blueprint(children: ParsedNode[]): Blueprint {
    const blueprint = new Blueprint();
    blueprint.nodes = children.map((node) => this.node(node, blueprint));
    for (const [name, child] of blueprint.blueprints) {
      const path = name.split(".");
      const rows = blueprint.params.ensureField(path, true);
      rows.values.push({ kind: "rows", blueprint: child });
      blueprint.templates.ensureField(path).values.push({ kind: "blueprint", blueprint: child });
    }
    return blueprint;
  }

  attributes(node: ParsedElement, blueprint: Blueprint, element: ElementInfo): Record<string, string> {
    const entries: [string, string][] = [];
    for (const { name: parsedName, value, prefix } of node.attrs) {
      let name = parsedName;
      if (name.startsWith("on")) {
        const location = node.sourceCodeLocation?.attrs?.[name];
        if (location) name = this.source.slice(location.startOffset, location.endOffset).match(/^[^\s=]+/)![0];
      }
      if (name !== "ref") {
        for (const match of placeholders(value)) {
          const whole = match[0] === value;
          if (whole && name.startsWith("on") && name.length > 2) {
            const event = name[2].toLowerCase() + name.slice(3);
            blueprint.parameter(match[1], { kind: "event", name: event });
          } else if (whole && name === "$init") {
            blueprint.parameter(match[1], { kind: "init", element });
          } else blueprint.parameter(match[1], { kind: "string" });
        }
      }
      entries.push([prefix ? `${prefix}:${name}` : name, value]);
    }
    return Object.fromEntries(entries);
  }

  node(node: ParsedNode, blueprint: Blueprint, namespace: string = html.NS.HTML): XMLChild {
    if ("value" in node) {
      for (const match of placeholders(node.value)) blueprint.parameter(match[1], { kind: "content" });
      return node.value;
    }
    if ("data" in node) return xmlComment(node.data);
    if ("tagName" in node) return this.element(node, blueprint, namespace);
    throw new Error("Expected an HTML fragment, not a document type.");
  }

  element(node: ParsedElement, blueprint: Blueprint, namespace: string): XMLChild {
    const info: ElementInfo = {
      tag: node.tagName,
      namespace: node.namespaceURI === html.NS.SVG ? "svg" : node.namespaceURI === html.NS.MATHML ? "mathml" : "html",
    };
    const attrs = this.attributes(node, blueprint, info);
    if (node.namespaceURI !== namespace) attrs.$xmlns = node.namespaceURI === html.NS.HTML ? "" : node.namespaceURI;
    const id = attrs.id;
    const refPath = attrs.ref === undefined ? undefined : referencePath(attrs.ref);
    const ref = refPath?.join(".");
    const content = "content" in node ? this.blueprint(node.content.childNodes) : undefined;
    if (content) blueprint.templateContents.push(content);
    if (content && ref) info.anchor = { name: ref, blueprint: content };
    if (id && placeholders(id).next().done) {
      const property = blueprint.ids.ensureField([id]);
      property.values.push({ kind: "element", element: info });
    }
    if (refPath) {
      const property = blueprint.refs.ensureField(refPath);
      property.values.push({ kind: "element", element: info });
    }
    const element = content
      ? xmlElement(node.tagName, attrs, ...content.nodes)
      : xmlElement(node.tagName, attrs, ...node.childNodes.map((child) => this.node(child, blueprint, node.namespaceURI)));
    if (content && ref) {
      this.blueprints.set(ref, content);
      blueprint.blueprints.set(ref, content);
      this.templateNames.set(element, ref);
    }
    return element;
  }
}
