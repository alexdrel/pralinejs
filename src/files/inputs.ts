import { glob, stat } from "node:fs/promises";
import { matchesGlob, relative, resolve, sep } from "node:path";

/** Discover HTML inputs once, retaining selection errors alongside usable files. */
export async function discoverInputs(
  inputs: readonly string[],
  exclude: readonly string[] = [],
  cwd = process.cwd(),
): Promise<{ files: string[]; errors: string[] }> {
  const files = new Set<string>();
  const errors: string[] = [];
  const exclusions = exclude.map((pattern) => {
    pattern = pattern.split(sep).join("/");
    const directoryOnly = pattern.endsWith("/");
    const rooted = pattern.startsWith("/") || pattern.startsWith("./");
    pattern = pattern.replace(/^\.?\//, "").replace(/\/$/, "");
    return { pattern, directoryOnly, basename: !rooted && !pattern.includes("/") };
  });

  function excluded(file: string, directory = false): boolean {
    const parts = relative(cwd, resolve(cwd, file)).split(sep);
    for (const { pattern, directoryOnly, basename } of exclusions) {
      const count = parts.length - (directoryOnly && !directory ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const candidate = basename ? parts[i] : parts.slice(0, i + 1).join("/");
        if (matchesGlob(candidate, pattern)) return true;
      }
    }
    return false;
  }

  for (const input of inputs) {
    try {
      const path = resolve(cwd, input);
      let directory = false;
      let exists = false;
      try {
        const info = await stat(path);
        directory = info.isDirectory();
        exists = true;
        if (!directory && !info.isFile()) throw new Error("Expected an HTML file or directory");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (exists && !directory && !path.endsWith(".html")) throw new Error("Expected an .html input");

      let matched = false;
      if (exists && !directory) {
        if (!excluded(path)) {
          files.add(path);
          matched = true;
        }
      } else {
        const pattern = directory ? `${path.split(sep).join("/")}/**/*.html` : input;
        const base = directory ? path : cwd;
        for await (const entry of glob(pattern, {
          cwd,
          withFileTypes: true,
          exclude(entry) {
            const file = resolve(entry.parentPath, entry.name);
            if (excluded(file, entry.isDirectory())) return true;
            if (!entry.isDirectory()) return false;
            const parts = relative(base, file).split(sep);
            return parts.some((part) => part !== "." && part !== ".." && (part === "node_modules" || part.startsWith(".")));
          },
        })) {
          const file = resolve(entry.parentPath, entry.name);
          if (!file.endsWith(".html") || excluded(file) || !(await stat(file)).isFile()) continue;
          files.add(file);
          matched = true;
        }
      }
      if (!matched) errors.push(`${input}: No HTML inputs matched`);
    } catch (error) {
      errors.push(`${input}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { files: [...files].sort(), errors };
}
