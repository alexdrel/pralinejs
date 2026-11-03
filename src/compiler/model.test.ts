import assert from "node:assert/strict";
import { test } from "node:test";
import { Blueprint, Contract } from "./model.ts";

test("contract groups are optional only when all their properties are optional", () => {
  const contract = new Contract();
  const rows = contract.ensureField(["menu", "rows"], true);
  rows.values.push({ kind: "rows", blueprint: new Blueprint() });
  assert.equal(contract.fields.get("menu")!.optional, true);
  contract.ensureField(["menu", "title"]).values.push({ kind: "parameter", uses: [{ kind: "string" }] });
  assert.equal(contract.fields.get("menu")!.optional, false);
  assert.equal(rows.optional, true);
  assert.equal(contract.ensureField(["menu", "rows"], true), rows);
  assert.deepEqual(
    contract.leafProperties().map((property) => property.values[0]?.kind),
    ["rows", "parameter"],
  );
});

test("contract insertion retains leaf/group conflicts and literal ID keys for validation", () => {
  const contract = new Contract();
  contract.ensureField(["edit"]).values.push({ kind: "parameter", uses: [{ kind: "string" }] });
  contract.ensureField(["edit", "undo"]).values.push({ kind: "parameter", uses: [{ kind: "content" }] });
  const edit = contract.fields.get("edit")!;
  assert.equal(edit.values.length, 1);
  assert.equal(edit.fields.get("undo")!.values.length, 1);
  const ids = new Contract();
  ids.ensureField(["literal.id"]).values.push({ kind: "element", element: { tag: "input", namespace: "html" } });
  assert.deepEqual([...ids.fields.keys()], ["literal.id"]);
});

test("parameters retain their authored uses for later validation", () => {
  const blueprint = new Blueprint();
  blueprint.parameter("label", { kind: "content" });
  blueprint.parameter("label", { kind: "string" });
  assert.deepEqual(blueprint.params.fields.get("label")!.values[0], {
    kind: "parameter",
    uses: [{ kind: "content" }, { kind: "string" }],
  });
  blueprint.parameter("select", { kind: "event", name: "click" });
  blueprint.parameter("select", { kind: "event", name: "keydown" });
  assert.deepEqual(blueprint.params.fields.get("select")!.values[0], {
    kind: "parameter",
    uses: [
      { kind: "event", name: "click" },
      { kind: "event", name: "keydown" },
    ],
  });
  assert.doesNotThrow(() => blueprint.parameter("select", { kind: "content" }));
  assert.doesNotThrow(() => blueprint.parameter("label", { kind: "event", name: "click" }));
});
