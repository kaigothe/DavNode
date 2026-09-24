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
 * Reads the attribute `name` of `node`'s underlying DOM element — the
 * `content-type`/`match-type`/`name` attributes CardDAV REPORT bodies
 * carry, which {@link QualifiedElement} (element names only) can't
 * reach.
 *
 * @returns The attribute's value, or `undefined` if `node` isn't an
 * element or doesn't carry that attribute.
 */
export function getAttributeValue(
  node: { readonly nodeType: number },
  name: string,
): string | undefined {
  if (node.nodeType !== ELEMENT_NODE) {
    return undefined;
  }
  const value = (
    node as unknown as { getAttribute(attribute: string): string | null }
  ).getAttribute(name);
  return value ?? undefined;
}

/**
 * Escapes `text` for use as XML text content (not inside an attribute).
 * Useful wherever a live property's value (e.g. `displayname`, taken
 * directly from a `Collection`/`FileResource` column) needs to become
 * an already-escaped value string without going through a parsed XML
 * element the way `serializeElementChildren` does.
 *
 * Also drops the characters XML 1.0 forbids outright (C0 controls other
 * than tab/LF/CR, and U+FFFE/U+FFFF): xmlbuilder2 would serialize them
 * verbatim, and a single such character — say in a vCard stored via
 * PUT — would make a whole multistatus response unparseable for the
 * client, not just its own entry.
 */
export function escapeXmlText(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- these control characters are exactly what XML 1.0 forbids.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  );
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
