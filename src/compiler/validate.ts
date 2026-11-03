import { type Blueprint, type Contract, type HtmlModule, type Property } from "./model.ts";
import { helperTypeNames, templateTypeName } from "./types.ts";
import { placeholders, validateContentParams } from "../lib/template.ts";

const reservedNames = new Set([
  ..."arguments await break case catch class const continue debugger default delete do else enum eval export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield".split(
    " ",
  ),
  ...helperTypeNames,
  "__praline",
  "Params",
  "Refs",
  "Ids",
  "Templates",
]);

function validateContract(contract: Contract, kind: "params" | "refs" | "ids" | "templates"): void {
  function fields(properties: Map<string, Property>, prefix = ""): void {
    for (const [name, property] of properties) {
      const path = prefix + name;
      if (property.values.length && property.fields.size) throw new Error(`Declaration path collision: ${path}`);
      if (property.values.length > 1) {
        if (kind === "ids") throw new Error(`Duplicate HTML id: ${JSON.stringify(name)}`);
        if (kind === "refs") throw new Error(`HTML reference path collision: ${path}`);
        if (kind === "params") throw new Error(`Blueprint name conflicts with a parameter: ${path}`);
        throw new Error(`Duplicate template export: ${path}`);
      }
      const value = property.values[0];
      if (value?.kind === "parameter") {
        const handlers = value.uses.some((use) => use.kind === "event" || use.kind === "init");
        const values = value.uses.some((use) => use.kind === "string" || use.kind === "content");
        if (handlers && values) throw new Error(`Incompatible uses of template parameter: ${path}`);
      }
      fields(property.fields, `${path}.`);
    }
  }
  fields(contract.fields);
}

function validateBlueprint(blueprint: Blueprint): void {
  const resultNames: string[] = [];
  for (const name of blueprint.blueprints.keys()) {
    if (["fragment", "refs", "ids"].includes(name.split(".")[0])) throw new Error(`Template name conflicts with materialization result: ${name}`);
    const resultName = `${name}Refs`;
    if (resultNames.some((existing) => existing === resultName || existing.startsWith(`${resultName}.`) || resultName.startsWith(`${existing}.`))) {
      throw new Error(`Template result path collision: ${resultName}`);
    }
    resultNames.push(resultName);
  }
  validateContract(blueprint.params, "params");
  validateContract(blueprint.refs, "refs");
  validateContract(blueprint.ids, "ids");
  validateContract(blueprint.templates, "templates");
  for (const content of blueprint.templateContents) validateBlueprint(content);
}

/** Validate semantic constraints and the names exposed by generated modules. */
export function validate(module: HtmlModule): void {
  function validateNodes(nodes: Blueprint["nodes"]): void {
    for (const node of nodes) {
      if (typeof node === "string") continue;
      validateContentParams(node);
      const [, attrs, ...children] = node;
      for (const [name, value] of Object.entries(attrs)) {
        if (!name.startsWith("on") || name.length === 2) continue;
        const matches = [...placeholders(String(value))];
        if (matches.length !== 1 || matches[0][0] !== value) {
          throw new Error(`Event attribute ${name} requires a whole-attribute parameter.`);
        }
      }
      validateNodes(children);
    }
  }
  validateNodes(module.root.nodes);
  validateBlueprint(module.root);
  const names = new Set<string>();
  const typeNames = new Map<string, string>();
  for (const name of module.templateNames.values()) {
    if (names.has(name)) throw new Error(`Duplicate template export: ${name}`);
    names.add(name);
    const parts = name.split(".");
    let prefix = "";
    for (const part of parts) {
      if (!/^[$A-Z_a-z][$\w]*$/.test(part) || reservedNames.has(part) || (!prefix && reservedNames.has(templateTypeName(part)))) {
        throw new Error(`Template reference cannot be exported as a TypeScript name: ${name}`);
      }
      if (prefix && module.blueprints.has(prefix)) throw new Error(`Blueprint export path collision: ${name}`);
      prefix = prefix ? `${prefix}.${part}` : part;
      const typeName = templateTypeName(prefix);
      const existing = typeNames.get(typeName);
      if (existing && existing !== prefix) throw new Error(`Template type namespace collision: ${existing} and ${prefix}`);
      typeNames.set(typeName, prefix);
    }
  }
}
