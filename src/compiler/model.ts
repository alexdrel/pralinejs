import { type ReadonlyXmlElement, type XMLChild } from "@alexdrel/jsonml-ts";

export type ElementInfo = {
  tag: string;
  namespace: "html" | "svg" | "mathml";
  anchor?: { name: string; blueprint: Blueprint };
};

export type ParameterUse = { kind: "content" | "string" } | { kind: "event"; name: string } | { kind: "init"; element: ElementInfo };

export type PropertyValue =
  | { kind: "parameter"; uses: ParameterUse[] }
  | { kind: "element"; element: ElementInfo }
  | { kind: "rows" | "blueprint"; blueprint: Blueprint };

export type Property = {
  values: PropertyValue[];
  optional: boolean;
  fields: Map<string, Property>;
};

/** A contract's actual property structure, including dotted parameter and ref paths. */
export class Contract {
  fields = new Map<string, Property>();

  get size(): number {
    return this.fields.size;
  }

  ensureField(path: readonly string[], optional = false): Property {
    let fields = this.fields;
    let property: Property;
    for (const name of path) {
      property = fields.get(name)!;
      if (!property) {
        property = { values: [], optional, fields: new Map() };
        fields.set(name, property);
      }
      property.optional &&= optional;
      fields = property.fields;
    }
    return property!;
  }

  leafProperties(fields = this.fields): Property[] {
    const result: Property[] = [];
    for (const property of fields.values()) {
      if (property.values.length) result.push(property);
      result.push(...this.leafProperties(property.fields));
    }
    return result;
  }
}

export class Blueprint {
  nodes: XMLChild[] = [];
  params = new Contract();
  refs = new Contract();
  ids = new Contract();
  templates = new Contract();
  /** Named template contents declared in this blueprint's scope. */
  blueprints = new Map<string, Blueprint>();
  /** All directly owned template contents, including anonymous ones. */
  templateContents: Blueprint[] = [];

  parameter(name: string, use: ParameterUse): void {
    const property = this.params.ensureField(name.split("."));
    let parameter = property.values.find((value) => value.kind === "parameter");
    if (!parameter) {
      parameter = { kind: "parameter", uses: [] };
      property.values.push(parameter);
    }
    parameter.uses.push(use);
  }

  get hasContracts(): boolean {
    return this.params.size > 0 || this.refs.size > 0 || this.ids.size > 0 || this.templates.size > 0;
  }
}

export type HtmlModule = {
  root: Blueprint;
  /** All named exports, with children ordered before the blueprints that use them. */
  blueprints: Map<string, Blueprint>;
  templateNames: Map<ReadonlyXmlElement, string>;
  namedOnly: boolean;
};
