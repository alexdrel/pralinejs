/** Explicit reference paths use authored names, without ID aliases or conversion. */
export function referencePath(text: string): string[] {
  const match = text.match(/^\{\{\s*([$\w]+(?:\.[$\w]+)*)\s*\}\}$/);
  if (!match) throw new Error(`Invalid reference declaration: ${text}`);
  const path = match[1].split(".");
  if (path.some((part) => ["__proto__", "prototype", "constructor"].includes(part))) throw new Error(`Invalid reference path: ${match[1]}`);
  return path;
}

/** First source owning the root wins; nested lookup never falls through to another source. */
export function parameterValue(sources: readonly object[], name: string, required = true): unknown {
  const path = name.split(".");
  let receiver: object | undefined = sources.find((source) => path[0] in source);
  let value: unknown;
  for (const [index, part] of path.entries()) {
    if (!receiver || !(part in receiver)) {
      if (required) throw new Error(`Missing template parameter: ${name}`);
      return undefined;
    }
    value = (receiver as Record<string, unknown>)[part];
    if (index < path.length - 1) receiver = value !== null && (typeof value === "object" || typeof value === "function") ? value : undefined;
  }
  return typeof value === "function" ? value.bind(receiver) : value;
}

export function setReference(target: Record<string, unknown>, path: readonly string[], value: unknown) {
  for (const part of path.slice(0, -1)) {
    if (!Object.hasOwn(target, part)) target[part] = Object.create(null);
    const group = target[part];
    if (group === null || typeof group !== "object" || Object.getPrototypeOf(group) !== null) {
      throw new Error(`HTML reference path collision: ${path.join(".")}`);
    }
    target = group as Record<string, unknown>;
  }
  const name = path.at(-1)!;
  if (Object.hasOwn(target, name)) throw new Error(`HTML reference path collision: ${path.join(".")}`);
  target[name] = value;
}
