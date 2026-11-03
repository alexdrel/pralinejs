import { type ParamNode } from "./types.ts";
import { parameterValue } from "./paths.ts";

export { type ParamContent } from "./types.ts";

/** Locate named placeholders without interpreting supplied values as template source. */
export function placeholders(text: string): RegExpStringIterator<RegExpExecArray> {
  return text.matchAll(/\{\{\s*([\w$.-]+)\s*\}\}/g);
}

/** Script and stylesheet content require explicit permission for substitution. */
export function validateContentParams(node: ParamNode): void {
  if (typeof node === "string") return;
  const [tag, attrs, ...children] = node;
  if (tag.toLowerCase() !== "script" && tag.toLowerCase() !== "style") return;
  const permission = attrs["unsafe-content-params"];
  if (permission !== undefined && permission !== false) return;
  function hasParams(nodes: readonly ParamNode[]): boolean {
    for (const child of nodes) {
      if (typeof child === "string") {
        if (!placeholders(child).next().done) return true;
      } else {
        const [tag, , ...children] = child;
        if (tag === "$comment" || tag === "$cdata") continue;
        if (hasParams(children)) return true;
      }
    }
    return false;
  }
  if (hasParams(children)) throw new Error(`Content parameters in <${tag}> require unsafe-content-params.`);
}

/** Substitute parameters in JSONML, preserving the original reusable template. */
export function fillTemplate(nodes: Iterable<ParamNode>, params: readonly object[]): ParamNode[] {
  function value(name: string): unknown {
    return parameterValue(params, name);
  }

  function textParts(text: string): ParamNode[] {
    const result: ParamNode[] = [];
    let position = 0;
    for (const match of placeholders(text)) {
      if (match.index > position) result.push(text.slice(position, match.index));
      const supplied = value(match[1]);
      if (typeof supplied === "string") result.push(supplied);
      else if (Array.isArray(supplied)) {
        const tuple = typeof supplied[0] === "string" && supplied[1] && typeof supplied[1] === "object" && !Array.isArray(supplied[1]);
        if (tuple) result.push(supplied as unknown as ParamNode);
        else result.push(...(supplied as ParamNode[]));
      } else throw new Error(`Content parameter ${match[1]} must be text or JSONML.`);
      position = match.index + match[0].length;
    }
    if (position < text.length) result.push(text.slice(position));
    return result;
  }

  function attribute(name: string, text: string): string | ((event: never) => void) {
    const matches = [...placeholders(text)];
    if (name.startsWith("on") && name.length > 2 && (matches.length !== 1 || matches[0][0] !== text)) {
      throw new Error(`Event attribute ${name} requires a whole-attribute parameter.`);
    }
    if (matches.length === 1 && matches[0][0] === text) {
      const supplied = value(matches[0][1]);
      const callable = name === "$init" || (name.startsWith("on") && name.length > 2);
      if (callable && typeof supplied === "function") return supplied as (event: never) => void;
      if (!callable && typeof supplied === "string") return supplied;
      throw new Error(`Attribute parameter ${matches[0][1]} must be ${callable ? "callable" : "a string"}.`);
    }
    return text.replace(/\{\{\s*([\w$.-]+)\s*\}\}/g, (_, name: string) => {
      const supplied = value(name);
      if (typeof supplied !== "string") throw new Error(`Embedded attribute parameter ${name} must be a string.`);
      return supplied;
    });
  }

  function expand(node: ParamNode): ParamNode[] {
    if (typeof node === "string") return textParts(node);
    validateContentParams(node);
    const [tag, attrs, ...children] = node;
    if (tag === "$comment" || tag === "$cdata") return [node];
    const resolved = Object.fromEntries(
      Object.entries(attrs).map(([name, supplied]) => [name, name !== "ref" && typeof supplied === "string" ? attribute(name, supplied) : supplied]),
    );
    // Embedded templates own a separate parameter scope, populated later.
    return [[tag, resolved, ...(tag === "template" ? children : children.flatMap(expand))]];
  }

  const result: ParamNode[] = [];
  for (const node of nodes) result.push(...expand(node));
  return result;
}
