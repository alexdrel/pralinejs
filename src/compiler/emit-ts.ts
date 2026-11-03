import { fragments, type ReadonlyXmlElement } from "@alexdrel/jsonml-ts";
import { stringifyJsonMl } from "@alexdrel/jsonml-ts/serialize";
import { type Blueprint, type Contract, type Property, type PropertyValue, type ParameterUse, type ElementInfo, type HtmlModule } from "./model.ts";
import { elementHelpers, helperTypes, templateTypeName, type TypeMode } from "./types.ts";
import { Writer } from "./writer.ts";

function blueprintType(blueprint: Blueprint, prefix = ""): string {
  const types = [
    blueprint.params.size ? `${prefix}Params` : "object",
    blueprint.refs.size ? `${prefix}Refs` : "object",
    blueprint.ids.size ? `${prefix}Ids` : "object",
    blueprint.templates.size ? `${prefix}Templates` : "object",
  ];
  return `Blueprint<${types.join(", ")}>`;
}

function nativeElementType(element: ElementInfo): string {
  return `${elementHelpers[element.namespace]}<${JSON.stringify(element.tag)}>`;
}

function parameterType(uses: ParameterUse[]): string {
  if (uses.some((use) => use.kind === "string")) return "string";
  if (uses.every((use) => use.kind === "content")) return "ParamContent";
  let result = "";
  for (const use of uses) {
    let type: string;
    if (use.kind === "event") type = `(event: DomEvent<${JSON.stringify(use.name)}>) => void`;
    else if (use.kind === "init") type = `(element: ${nativeElementType(use.element)}) => void`;
    else continue;
    result = !result || result === type ? type : `(${result}) & (${type})`;
  }
  return result;
}

function propertyType(value: PropertyValue, path: string): string {
  switch (value.kind) {
    case "parameter":
      return parameterType(value.uses);
    case "element": {
      let type = nativeElementType(value.element);
      const anchor = value.element.anchor;
      if (anchor) {
        const name = templateTypeName(anchor.name);
        const params = anchor.blueprint.params.size ? `${name}.Params` : "object";
        const refs = anchor.blueprint.refs.size ? `${name}.Refs` : undefined;
        const args = refs ? `<${params}, ${refs}>` : anchor.blueprint.params.size ? `<${params}>` : "";
        type += ` & TemplateAnchor${args}`;
      }
      return type;
    }
    case "blueprint":
      return `typeof ${path}`;
    case "rows":
      return value.blueprint.params.size ? `readonly Partial<${templateTypeName(path)}.Params>[]` : "readonly object[]";
  }
}

/** Write the contracts already recorded on the blueprint, without rebuilding them. */
function declarations(out: Writer, blueprint: Blueprint): void {
  function properties(fields: Map<string, Property>, prefix = ""): void {
    for (const [name, property] of fields) {
      const key = /^[$A-Z_a-z][$\w]*$/.test(name) ? name : JSON.stringify(name);
      const head = `${key}${property.optional ? "?" : ""}: `;
      const path = prefix + name;
      const value = property.values[0];
      const type = value ? propertyType(value, path) : undefined;
      if (type !== undefined) out.write(`${head}${type};`);
      else out.block(`${head}{`, () => properties(property.fields, `${path}.`), "};");
    }
  }

  let first = true;
  function contract(name: string, value: Contract): void {
    if (!value.size) return;
    if (!first) out.write("");
    first = false;
    out.block(`export interface ${name} {`, () => properties(value.fields));
  }

  contract("Params", blueprint.params);
  contract("Refs", blueprint.refs);
  contract("Ids", blueprint.ids);
  contract("Templates", blueprint.templates);
}

/** Blueprint values retain authored names; their contract namespaces are capitalized. */
export function emitTs(module: HtmlModule, format: "ts" | "dts", types: TypeMode = "import"): string {
  const children = new Map<ReadonlyXmlElement, string>();
  for (const [node, name] of module.templateNames) {
    children.set(node, `...${name}`);
  }

  function emitBlueprint(blueprint: Blueprint, prefix = ""): string {
    const value = stringifyJsonMl(fragments(blueprint.nodes), { spaces: true, children, rootAsArray: true });
    return `${value} as unknown as ${blueprintType(blueprint, prefix)}`;
  }

  function emitExport(path: string, blueprint: Blueprint): string {
    const prefix = path === "default" ? "" : `${templateTypeName(path)}.`;
    const type = blueprintType(blueprint, prefix);
    if (path === "default") {
      if (format === "dts") return `declare const __praline: ${type};\n\nexport default __praline;`;
      return `export default ${emitBlueprint(blueprint)};`;
    }
    const parts = path.split(".");
    const name = parts.at(-1)!;
    if (format === "dts") return `export ${parts.length === 1 ? "declare " : ""}const ${name}: ${type};`;
    return `export const ${name} = ${emitBlueprint(blueprint, prefix)};`;
  }

  const out = new Writer();

  function namespace(path: string, body: () => void): void {
    if (!path) return body();
    const [name, ...rest] = path.split(".");
    out.block(`export namespace ${name} {`, () => namespace(rest.join("."), body));
  }

  out.write('/// <reference lib="dom" />');
  out.write("// Generated by Praline. Do not edit.");

  out.write(...helperTypes(module, types));
  if (!module.namedOnly) {
    declarations(out, module.root);
    if (module.root.hasContracts) out.write("");
  }

  for (const [path, blueprint] of module.blueprints) {
    const parts = path.split(".");
    parts.pop();
    const exported = emitExport(path, blueprint);
    namespace(parts.join("."), () => {
      out.write(exported);
    });
    if (blueprint.hasContracts) {
      out.write("");
      namespace(templateTypeName(path), () => declarations(out, blueprint));
    }
    out.write("");
  }

  if (!module.namedOnly) {
    out.write(emitExport("default", module.root));
  }
  return out.output;
}
