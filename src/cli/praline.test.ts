import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import packageJson from "../../package.json" with { type: "json" };

test("source and built commands report help, version, and missing-input usage", () => {
  for (const entry of ["./praline.ts", "../../dist/cli.js"]) {
    const cli = fileURLToPath(new URL(entry, import.meta.url));
    for (const flag of ["--help", "-h"]) {
      const result = spawnSync(process.execPath, [cli, flag], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Usage: praline/);
      assert.match(result.stdout, /--exclude/);
      assert.equal(result.stderr, "");
    }
    for (const flag of ["--version", "-v"]) {
      const result = spawnSync(process.execPath, [cli, flag], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `${packageJson.version}\n`);
    }
    const result = spawnSync(process.execPath, [cli], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: praline/);
  }
});

test("CLI expands quoted globs and directories, excludes files, and reports overlapping inputs once", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "praline-cli-inputs-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "parts/nested"), { recursive: true });
  for (const name of ["a", "z", "skip"]) await writeFile(join(root, `parts/nested/${name}.html`), "<p>Text</p>");
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./praline.ts", import.meta.url)), "--emit", "dts", "parts", "parts/**/*.html", "--exclude", "**/skip.html"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    ...["a", "z"].map((name) => `${join("parts", "nested", `${name}.html.d.ts`)} updated`),
    "2 files checked, 2 updated, 0 failed.",
  ]);
  assert.deepEqual((await readdir(join(root, "parts/nested"))).sort(), ["a.html", "a.html.d.ts", "skip.html", "z.html", "z.html.d.ts"]);
});

test("CLI reports selection and compilation errors with paths and still generates independent inputs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-cli-errors-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "bad.html"), '<p id="one" id="two"></p>');
  await writeFile(join(root, "semantic.html"), '<button onClick="{{same}}">{{same}}</button>');
  await writeFile(join(root, "good.html"), "<p>Good</p>");
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./praline.ts", import.meta.url)), "--emit", "dts", "missing.html", "*.html"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing\.html: No HTML inputs matched/);
  assert.ok(result.stderr.includes("bad.html: HTML 1:"));
  assert.ok(result.stderr.includes("semantic.html: Incompatible uses"));
  assert.ok(result.stdout.endsWith("3 files checked, 1 updated, 3 failed.\n"));
  assert.match(await readFile(join(root, "good.html.d.ts"), "utf8"), /declare const __praline/);
  assert.deepEqual((await readdir(root)).sort(), ["bad.html", "good.html", "good.html.d.ts", "semantic.html"]);
});

test("bundled CLI supports imported and embedded types through the packaged resource", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-cli-bundle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, "panel.html");
  await writeFile(input, '<input ref="{{input}}">');
  for (const types of ["import", "embed"]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), "--emit", "dts", "--types", types, input], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = await readFile(`${input}.d.ts`, "utf8");
    assert.match(output, /input: HtmlElement<"input">/);
    if (types === "import") assert.match(output, /from "@alexdrel\/pralinejs"/);
    else assert.match(output, /type Blueprint</);
  }
});

for (const emit of ["ts", "dts"] as const) {
  test(`CLI --types embed emits self-contained ${emit} contracts`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "praline-cli-embed-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const input = join(root, "panel.html");
    await writeFile(input, '<input ref="{{input}}">');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./praline.ts", import.meta.url)), "--emit", emit, "--types", "embed", input], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const code = await readFile(`${input}.${emit === "dts" ? "d.ts" : "ts"}`, "utf8");
    assert.match(code, /^\/\/\/ <reference lib="dom" \/>/);
    assert.match(code, /type Blueprint</);
    assert.doesNotMatch(code, /import type/);
  });
}

test("CLI rejects an unknown type mode", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./praline.ts", import.meta.url)), "--types", "unknown"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown type mode: unknown/);
});

test("log levels control file statuses and totals without hiding errors", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "praline-cli-logging-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "good.html"), "<p>Good</p>");
  await writeFile(join(root, "bad.html"), '<p id="a" id="b"></p>');
  const cli = fileURLToPath(new URL("./praline.ts", import.meta.url));
  for (const level of ["verbose", "info", "error"]) {
    const result = spawnSync(process.execPath, [cli, "--log-level", level, "--emit", "none", "*.html"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /bad\.html: HTML 1:/);
    const summary = "2 files checked, 0 updated, 1 failed.\n";
    assert.equal(result.stdout, level === "verbose" ? `good.html valid\n${summary}` : level === "info" ? summary : "");
  }
  const invalid = spawnSync(process.execPath, [cli, "--log-level", "unknown", "good.html"], { cwd: root, encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown log level: unknown/);
});

test("CLI source update mode preserves edited declarations until HTML changes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-cli-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, "panel.html");
  const run = () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./praline.ts", import.meta.url)), "--emit", "dts", "--update", "source", input], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  await writeFile(input, '<button ref="{{action}}">Go</button>');
  const output = `${input}.d.ts`;
  assert.equal(run(), `${relative(process.cwd(), output)} updated\n1 file checked, 1 updated, 0 failed.\n`);
  const edited = (await readFile(output, "utf8")) + "\n// User edit\n";
  await writeFile(output, edited);
  assert.equal(run(), `${relative(process.cwd(), output)} up to date\n1 file checked, 0 updated, 0 failed.\n`);
  assert.equal(await readFile(output, "utf8"), edited);
  await writeFile(input, '<input ref="{{input}}">');
  assert.equal(run(), `${relative(process.cwd(), output)} updated\n1 file checked, 1 updated, 0 failed.\n`);
  const updated = await readFile(output, "utf8");
  assert.match(updated, /input: HtmlElement<"input">/);
  assert.doesNotMatch(updated, /User edit/);
});

for (const emit of ["none", "js", "ts", "dts"] as const) {
  test(`CLI emit ${emit} writes only the selected output`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "praline-cli-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const input = join(root, "panel.html");
    await writeFile(input, '<button ref="{{action}}">Go</button>');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./praline.ts", import.meta.url)), "--emit", emit, input], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = `panel.html.${emit === "dts" ? "d.ts" : emit}`;
    const display = relative(process.cwd(), emit === "none" ? input : join(root, output));
    assert.equal(result.stdout, `${display} ${emit === "none" ? "valid" : "updated"}\n1 file checked, ${emit === "none" ? 0 : 1} updated, 0 failed.\n`);
    const repeated = spawnSync(process.execPath, [fileURLToPath(new URL("./praline.ts", import.meta.url)), "--emit", emit, input], { encoding: "utf8" });
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(repeated.stdout, `${display} ${emit === "none" ? "valid" : "up to date"}\n1 file checked, 0 updated, 0 failed.\n`);
    assert.deepEqual((await readdir(root)).sort(), emit === "none" ? ["panel.html"] : ["panel.html", output].sort());
    if (emit !== "none") {
      const code = await readFile(join(root, output), "utf8");
      assert.match(code, emit === "dts" ? /declare const __praline/ : /export default \[/);
      if (emit !== "js") assert.match(code, /import type .* from "@alexdrel\/pralinejs";/);
    }
  });
}

for (const emit of ["none", "js", "ts", "dts"] as const) {
  test(`CLI clean with emit ${emit} removes other formats and preserves HTML and unrelated files`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "praline-cli-clean-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const input = join(root, "panel.html");
    const source = "<button>Go</button>";
    await writeFile(input, source);
    for (const suffix of ["js", "ts", "d.ts", "css"]) await writeFile(`${input}.${suffix}`, "old");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./praline.ts", import.meta.url)), "--emit", emit, "--clean", input], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const expected = ["panel.html", "panel.html.css"];
    if (emit !== "none") expected.push(`panel.html.${emit === "dts" ? "d.ts" : emit}`);
    assert.deepEqual((await readdir(root)).sort(), expected.sort());
    assert.equal(await readFile(input, "utf8"), source);
  });
}

test("CLI clean preserves previous output when compilation fails", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-cli-clean-error-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, "panel.html");
  await writeFile(input, '<div id="a" id="b"></div>');
  await writeFile(`${input}.js`, "previous");
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./praline.ts", import.meta.url)), "--emit", "ts", "--clean", input], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(`${input}.js`, "utf8"), "previous");
});
