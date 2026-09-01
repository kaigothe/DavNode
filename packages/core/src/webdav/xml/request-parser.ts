import { create } from 'xmlbuilder2';
import { asElement, serializeElementChildren } from './xml-value.js';

/** The `DAV:` XML namespace URI (RFC 4918). */
export const DAV_NAMESPACE = 'DAV:';

/** A property's qualified name: its namespace URI and local name. */
export interface PropertyName {
  /** XML namespace URI, e.g. {@link DAV_NAMESPACE} or a client-defined namespace. */
  namespace: string;
  /** Local name within `namespace`, e.g. `'displayname'`. */
  name: string;
}

/**
 * A parsed PROPFIND request body (RFC 4918 §9.1): return every property
 * (`allprop`), only property names with no values (`propname`), or only
 * the explicitly listed `properties` (`prop`).
 */
export type PropfindRequestBody =
  | { kind: 'allprop' }
  | { kind: 'propname' }
  | { kind: 'prop'; properties: PropertyName[] };

/**
 * Parses a PROPFIND request body into a {@link PropfindRequestBody}.
 *
 * @param xml - The raw request body. A missing or empty body is a
 * valid PROPFIND request (RFC 4918 §9.1) — it's treated the same as an
 * explicit `<D:allprop/>` body.
 * @throws An `Error` (including the underlying XML parser's own
 * `SyntaxError` for malformed input) if `xml` is non-empty but isn't a
 * well-formed `DAV:propfind` document containing one of `allprop`,
 * `propname`, or `prop`.
 */
export function parsePropfindRequestBody(
  xml: string | null | undefined,
): PropfindRequestBody {
  if (xml === null || xml === undefined || xml.trim() === '') {
    return { kind: 'allprop' };
  }

  const root = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'propfind' ||
    rootElement.namespaceURI !== DAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a DAV:propfind root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  let body: PropfindRequestBody | undefined;
  root.each((child) => {
    const element = asElement(child.node);
    if (!element || element.namespaceURI !== DAV_NAMESPACE) {
      return;
    }
    if (element.localName === 'allprop') {
      body = { kind: 'allprop' };
    } else if (element.localName === 'propname') {
      body = { kind: 'propname' };
    } else if (element.localName === 'prop') {
      const properties: PropertyName[] = [];
      child.each((propertyNode) => {
        const propertyElement = asElement(propertyNode.node);
        if (propertyElement) {
          properties.push({
            namespace: propertyElement.namespaceURI ?? '',
            name: propertyElement.localName,
          });
        }
      });
      body = { kind: 'prop', properties };
    }
  });

  if (!body) {
    throw new Error(
      'DAV:propfind body has none of DAV:allprop, DAV:propname, or DAV:prop.',
    );
  }
  return body;
}

/** One `set` or `remove` instruction from a PROPPATCH request body. */
export type ProppatchOperation =
  | { kind: 'set'; property: PropertyName; value: string }
  | { kind: 'remove'; property: PropertyName };

/** A parsed PROPPATCH request body (RFC 4918 §9.2): an ordered list of instructions. */
export interface ProppatchRequestBody {
  operations: ProppatchOperation[];
}

/**
 * Parses a PROPPATCH request body into a {@link ProppatchRequestBody}.
 * Unlike PROPFIND, PROPPATCH has no meaningful "empty body" case — a
 * body is always required (RFC 4918 §9.2).
 *
 * A `set` instruction's value is captured via `serializeElementChildren`
 * (see `xml-value.ts`), preserving arbitrary child content (plain text
 * or nested XML) exactly as `CollectionProperty`/`FileProperty` expect
 * to store it.
 *
 * @throws An `Error` (including the underlying XML parser's own
 * `SyntaxError` for malformed input) if `xml` isn't a well-formed
 * `DAV:propertyupdate` document.
 */
export function parseProppatchRequestBody(xml: string): ProppatchRequestBody {
  const root = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'propertyupdate' ||
    rootElement.namespaceURI !== DAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a DAV:propertyupdate root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  const operations: ProppatchOperation[] = [];
  root.each((block) => {
    const blockElement = asElement(block.node);
    if (!blockElement || blockElement.namespaceURI !== DAV_NAMESPACE) {
      return;
    }
    const kind = blockElement.localName;
    if (kind !== 'set' && kind !== 'remove') {
      return;
    }
    block.each((propGroup) => {
      const propGroupElement = asElement(propGroup.node);
      if (!propGroupElement || propGroupElement.localName !== 'prop') {
        return;
      }
      propGroup.each((propertyNode) => {
        const propertyElement = asElement(propertyNode.node);
        if (!propertyElement) {
          return;
        }
        const property: PropertyName = {
          namespace: propertyElement.namespaceURI ?? '',
          name: propertyElement.localName,
        };
        operations.push(
          kind === 'set'
            ? {
                kind: 'set',
                property,
                value: serializeElementChildren(propertyNode),
              }
            : { kind: 'remove', property },
        );
      });
    });
  });

  return { operations };
}
