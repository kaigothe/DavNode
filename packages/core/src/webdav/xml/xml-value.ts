import { fragment } from 'xmlbuilder2';

/**
 * A node from xmlbuilder2's builder tree. Named locally since the
 * `xmlbuilder2` package's public entry point re-exports only its
 * builder functions (`create`, `fragment`, ...), not the `XMLBuilder`
 * interface those functions return.
 */
export type XmlNode = ReturnType<typeof fragment>;

/**
 * The subset of a builder node's underlying DOM node (`XmlNode.node`)
 * that only elements — not text or other node types — actually have.
 * `@oozcitak/dom`'s own `Node` interface (which xmlbuilder2 wraps, and
 * which isn't itself exported for the same reason as {@link XmlNode})
 * declares `localName`/`namespaceURI` on `Element`, not on the base
 * `Node` every child, including text nodes, is typed as — so accessing
 * them needs the narrowing {@link asElement} does.
 */
export interface QualifiedElement {
  readonly localName: string;
  readonly namespaceURI: string | null;
}

const ELEMENT_NODE = 1;

/**
 * Narrows a builder node's underlying DOM node (`XmlNode.node`) to
 * {@link QualifiedElement}, or returns `null` for anything that isn't
 * an element (chiefly the whitespace text nodes between sibling
 * elements in a pretty-printed request body).
 */
export function asElement(node: {
  readonly nodeType: number;
}): QualifiedElement | null {
  return node.nodeType === ELEMENT_NODE
    ? (node as unknown as QualifiedElement)
    : null;
}

/**
 * Serializes `element`'s children — text, a single nested element (e.g.
 * `resourcetype`'s `<D:collection/>`), or a mix of both — into one
 * self-contained XML string: plain text is escaped, element content is
 * serialized via xmlbuilder2 itself (which already emits any namespace
 * declarations that content depends on). The result is exactly what
 * `CollectionProperty`/`FileProperty` (`@davnode/core`'s entities)
 * store as a dead property's `value`, and what
 * {@link embedRawXmlContent} re-embeds when serving it back.
 */
export function serializeElementChildren(element: XmlNode): string {
  let result = '';
  element.each((child) => {
    result += child.toString();
  });
  return result;
}

/**
 * Embeds a string previously produced by {@link serializeElementChildren}
 * — or any other valid XML content or escaped text — into `destination`
 * as child content.
 *
 * xmlbuilder2's `fragment()` parser only accepts input that starts with
 * markup, so plain text (e.g. a `displayname` value) can't be parsed on
 * its own. Wrapping `value` in a throwaway `<x>` element first sidesteps
 * that, and importing only *that* wrapper's children — not the wrapper
 * itself — into `destination` round-trips all three shapes
 * `serializeElementChildren` can produce: plain text, a single element,
 * and genuine mixed content.
 */
export function embedRawXmlContent(destination: XmlNode, value: string): void {
  if (value === '') {
    return;
  }
  const wrapper = fragment(`<x>${value}</x>`).first();
  wrapper.each((child) => {
    destination.import(child);
  });
}
