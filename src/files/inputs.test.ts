import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { discoverInputs } from "./inputs.ts";

test("files, recursive directories, and globs combine into sorted unique HTML inputs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-inputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "components/nested"), { recursive: true });
  for (const file of ["components/z.html", "components/nested/a.html", "components/notes.txt", "components/z.html.d.ts"]) {
    await writeFile(join(root, file), "");
  }
  assert.deepEqual(await discoverInputs(["components", "components/**/*.html", "components/z.html"], [], root), {
    files: [join(root, "components/nested/a.html"), join(root, "components/z.html")],
    errors: [],
  });
});

test("discovery prunes dot and dependency directories, but not conventional output names", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-exclusions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ["node_modules/pkg", ".git", ".cache", "components/.private", "dist", "build", "components/pages", "components/nested"]) {
    await mkdir(join(root, dir), { recursive: true });
    await writeFile(join(root, dir, "ignored.html"), "");
  }
  await writeFile(join(root, "components/keep.html"), "");
  for (const input of [".", "**/*.html"]) {
    assert.deepEqual(await discoverInputs([input], ["**/pages/**", "components/nested/**"], root), {
      files: [join(root, "build/ignored.html"), join(root, "components/keep.html"), join(root, "dist/ignored.html")],
      errors: [],
    });
  }
});

test("explicit dot and dependency paths are allowed, with exclusions still applied", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-explicit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of [".components", "node_modules/pkg"]) {
    await mkdir(join(root, dir, ".cache"), { recursive: true });
    await writeFile(join(root, dir, "one.html"), "");
    await writeFile(join(root, dir, ".cache/hidden.html"), "");
    assert.deepEqual(await discoverInputs([dir, `${dir}/one.html`], [], root), {
      files: [join(root, dir, "one.html")],
      errors: [],
    });
    const excluded = await discoverInputs([`${dir}/one.html`], [`${dir}/one.html`], root);
    assert.deepEqual(excluded.files, []);
    assert.equal(excluded.errors.length, 1);
  }
});

test("selection errors retain other usable files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-input-errors-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "good.html"), "");
  await writeFile(join(root, "notes.txt"), "");
  await mkdir(join(root, "empty"));
  const result = await discoverInputs(["missing.html", "nothing/*.html", "empty", "notes.txt", "good.html"], [], root);
  assert.deepEqual(result.files, [join(root, "good.html")]);
  assert.deepEqual(result.errors, [
    "missing.html: No HTML inputs matched",
    "nothing/*.html: No HTML inputs matched",
    "empty: No HTML inputs matched",
    "notes.txt: Expected an .html input",
  ]);
});

test("exclusions match names at any depth and slash patterns relative to cwd", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "praline-patterns-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = ["index.html", "nested/index.html", "nested/draft-one.html", "pages/a.html", "nested/pages/b.html", "keep.html", "nested/keep.html"];
  for (const file of files) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), "");
  }
  const result = await discoverInputs(["."], ["index.html", "draft-*.html", "pages/"], root);
  assert.deepEqual(result, { files: [join(root, "keep.html"), join(root, "nested/keep.html")], errors: [] });
  for (const pattern of ["/index.html", "./index.html", "nested/index.html", "nested/pages", "nested/pages/"]) {
    const removed = pattern.startsWith("nested/pages") ? "nested/pages/b.html" : pattern.replace(/^\.?\//, "");
    const result = await discoverInputs(["."], [pattern], root);
    assert.deepEqual(
      result.files,
      files
        .filter((file) => file !== removed)
        .map((file) => join(root, file))
        .sort(),
    );
    assert.deepEqual(result.errors, []);
  }
  for (const pattern of ["pages", "pages/", "nested/pages"]) {
    const result = await discoverInputs(["nested/pages/b.html"], [pattern], root);
    assert.deepEqual(result.files, []);
    assert.equal(result.errors.length, 1);
  }
  assert.deepEqual((await discoverInputs(["index.html"], ["index.html/"], root)).files, [join(root, "index.html")]);
});
