/// Attrs
type Attrs = Record<string, string | number | boolean | undefined>;

/// XMLChild
type XMLChild = string | [tag: string, attrs: Attrs, ...children: XMLChild[]];

/// HtmlElement
export type HtmlElement<Tag extends string> = Tag extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[Tag] : HTMLElement;

/// SvgElement
export type SvgElement<Tag extends string> = Tag extends keyof SVGElementTagNameMap ? SVGElementTagNameMap[Tag] : SVGElement;

/// MathElement
export type MathElement<Tag extends string> = Tag extends keyof MathMLElementTagNameMap ? MathMLElementTagNameMap[Tag] : MathMLElement;

/// DomEvent
export type DomEvent<Name extends string> = Name extends keyof GlobalEventHandlersEventMap ? GlobalEventHandlersEventMap[Name] : Event;

/// EventHandlers
type EventHandlers = {
  [Name in keyof GlobalEventHandlersEventMap as `on${Capitalize<Name>}`]?: ((event: GlobalEventHandlersEventMap[Name]) => void) | `{{${string}}}`;
};

/// ParamAttrs
type ParamAttrs = {
  [name: string]: Attrs[string] | ((event: never) => void);
} & EventHandlers & { $init?: ((element: Element) => void) | `{{${string}}}`; $xmlns?: string };

/// ParamNode
export type ParamNode = string | readonly [tag: string, attrs: ParamAttrs, ...children: ParamNode[]];

/// ParamContent
export type ParamContent = ParamNode | readonly ParamNode[];

/// Blueprint
export type Blueprint<Params = object, Refs = object, Ids = object, Templates = object> = XMLChild[] & {
  __praline: { params: Params; refs: Refs; ids: Ids; templates: Templates };
};

/// TemplateAnchor
export interface TemplateAnchor<Params = object, Refs = object> {
  replaceItems(rows: readonly Partial<Params>[], above?: boolean): Refs[];
  appendItems(rows: readonly Partial<Params>[], above?: boolean): Refs[];
  prependItems(rows: readonly Partial<Params>[], above?: boolean): Refs[];
}
