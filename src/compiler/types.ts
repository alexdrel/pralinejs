import { readFileSync } from "node:fs";
import { type HtmlModule, type Blueprint, type ElementInfo } from "./model.ts";

export type TypeMode = "embed" | "import";
export interface EmitOptions {
  /** Import public package types (default), or embed self-contained declarations. */
  types?: TypeMode;
}

// This type-only source is also a compiler resource; distribution must preserve it.
// Each /// Name block extends to the next marker or EOF; no TypeScript syntax is parsed.
const source = readFileSync(new URL(import.meta.resolve("#praline-types")), "utf8");
const libraryTypes = new Map<string, string>();
for (const block of source.split(/^\/\/\/ /m).slice(1)) {
  const newline = block.indexOf("\n");
  const name = block.slice(0, newline).trim();
  const declaration = block.slice(newline + 1).trim();
  libraryTypes.set(name, declaration.replace(/^export /, "").trim());
}

export const helperTypeNames = new Set(libraryTypes.keys());

export const elementHelpers = { html: "HtmlElement", svg: "SvgElement", mathml: "MathElement" };

/** Type namespaces capitalize each segment; blueprint values keep authored names. */
export function templateTypeName(path: string): string {
  return path
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(".");
}

function usesNamespace(blueprint: Blueprint, namespace: ElementInfo["namespace"]): boolean {
  for (const contract of [blueprint.refs, blueprint.ids]) {
    for (const property of contract.leafProperties()) {
      const value = property.values[0];
      if (value?.kind === "element" && value.element.namespace === namespace) return true;
    }
  }
  for (const property of blueprint.params.leafProperties()) {
    const value = property.values[0];
    if (value?.kind !== "parameter") continue;
    if (value.uses.some((use) => use.kind === "init" && use.element.namespace === namespace)) return true;
  }
  return false;
}

function usesEvents(blueprint: Blueprint): boolean {
  for (const property of blueprint.params.leafProperties()) {
    const value = property.values[0];
    if (value?.kind === "parameter" && value.uses.some((use) => use.kind === "event")) return true;
  }
  return false;
}

function usesContent(blueprint: Blueprint): boolean {
  for (const property of blueprint.params.leafProperties()) {
    const value = property.values[0];
    if (value?.kind === "parameter" && value.uses.every((use) => use.kind === "content")) return true;
  }
  return false;
}

function hasBlueprint(module: HtmlModule, test: (blueprint: Blueprint) => boolean): boolean {
  return (!module.namedOnly && test(module.root)) || module.blueprints.values().some(test);
}

export function helperTypes(module: HtmlModule, mode: TypeMode = "import"): string[] {
  const names = ["Blueprint"];
  for (const namespace of ["html", "svg", "mathml"] as const) {
    if (hasBlueprint(module, (blueprint) => usesNamespace(blueprint, namespace))) names.push(elementHelpers[namespace]);
  }
  if (hasBlueprint(module, usesEvents)) names.push("DomEvent");
  if (hasBlueprint(module, (blueprint) => blueprint.blueprints.size > 0)) names.push("TemplateAnchor");
  if (hasBlueprint(module, usesContent)) {
    names.push("ParamContent");
  }
  if (mode === "import") return [`import type { ${names.join(", ")} } from "@alexdrel/pralinejs";`, ""];
  const lines = [libraryTypes.get("Attrs")!, libraryTypes.get("XMLChild")!];
  for (const name of names) {
    if (name === "ParamContent") {
      for (const dependency of ["EventHandlers", "ParamAttrs", "ParamNode"]) lines.push("", libraryTypes.get(dependency)!);
    }
    const declaration = libraryTypes.get(name);
    if (!declaration) throw new Error(`Missing library type declaration: ${name}`);
    lines.push("", declaration);
  }
  lines.push("");
  return lines;
}
