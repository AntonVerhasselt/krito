import { createElement, type ReactNode } from "react";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
const allowed = new Set([
  "p",
  "br",
  "span",
  "div",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "sub",
  "sup",
  "table",
  "tbody",
  "thead",
  "tr",
  "td",
  "th",
  "math",
  "mrow",
  "mi",
  "mn",
  "mo",
  "mfrac",
  "msup",
  "msub",
  "msubsup",
  "msqrt",
  "mroot",
  "mfenced",
  "mtext",
  "mtable",
  "mtr",
  "mtd",
  "mover",
  "munder",
  "munderover",
  "semantics",
]);
export function SourceMarkup({ html }: { html: string }) {
  function render(
    node: DefaultTreeAdapterTypes.ChildNode,
    key: number,
  ): ReactNode {
    if (node.nodeName === "#text")
      return (node as DefaultTreeAdapterTypes.TextNode).value;
    if (!("tagName" in node)) return null;
    if (
      [
        "script",
        "style",
        "iframe",
        "object",
        "annotation",
        "annotation-xml",
      ].includes(node.tagName)
    )
      return null;
    const children = node.childNodes.map(render);
    if (!allowed.has(node.tagName)) return children;
    const attrs: Record<string, string | number> = { key };
    // No URLs, inline styles or event handlers from source markup are ever executed.
    for (const attr of node.attrs)
      if (
        [
          "mathvariant",
          "display",
          "columnalign",
          "rowalign",
          "linethickness",
          "colspan",
          "rowspan",
        ].includes(attr.name)
      )
        attrs[attr.name] = attr.value;
    return createElement(
      node.tagName,
      attrs,
      ...(node.tagName === "br" ? [] : children),
    );
  }
  return <>{parseFragment(html).childNodes.map(render)}</>;
}
