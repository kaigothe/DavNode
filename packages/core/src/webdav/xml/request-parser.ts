import { SaxesParser } from 'saxes';
import { create } from 'xmlbuilder2';
import { asElement, serializeElementChildren } from './xml-value.js';

/** The `DAV:` XML namespace URI (RFC 4918). */
export const DAV_NAMESPACE = 'DAV:';

/**
 * Thrown by the request-body parsers when a body is not well-formed XML,
 * or is well-formed but not the document the method expects. It is the
 * client's fault, so the HTTP layer answers `400 Bad Request` for it
 * rather than the `500` an unexpected failure gets.
 */
export class InvalidRequestBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRequestBodyError';
  }
}

/**
 * Parses `xml`, turning the XML parser's own failure into an
 * {@link InvalidRequestBodyError}. `xmlbuilder2` alone is lenient — it
 * accepts unbalanced tags, trailing junk and undeclared namespace
 * prefixes — so a strict, namespace-aware pass with `saxes` checks
 * well-formedness first (RFC 4918 §8.2 wants `400` for a body that is
 * not well-formed).
 */
function parseXmlBody(xml: string): ReturnType<typeof create> {
  try {
    const strict = new SaxesParser({ xmlns: true });
    strict.on('error', (error) => {
      throw error;
    });
    strict.write(xml).close();
    return create(xml);
  } catch (error) {
    throw new InvalidRequestBodyError(
      `Request body is not well-formed XML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
  }
}

/** Any failure while reading a request body is the client's malformed input: keep our own error, wrap the XML library's. */
function toInvalidRequestBody(error: unknown): InvalidRequestBodyError {
  return error instanceof InvalidRequestBodyError
    ? error
    : new InvalidRequestBodyError(
        `Request body could not be processed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
}

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
 * @throws An {@link InvalidRequestBodyError} if `xml` is non-empty but isn't a
 * well-formed `DAV:propfind` document containing one of `allprop`,
 * `propname`, or `prop`.
 */
export function parsePropfindRequestBody(
  xml: string | null | undefined,
): PropfindRequestBody {
  try {
    if (xml === null || xml === undefined || xml.trim() === '') {
      return { kind: 'allprop' };
    }

    const root = parseXmlBody(xml).root();
    const rootElement = asElement(root.node);
    if (
      !rootElement ||
      rootElement.localName !== 'propfind' ||
      rootElement.namespaceURI !== DAV_NAMESPACE
    ) {
      throw new InvalidRequestBodyError(
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
      throw new InvalidRequestBodyError(
        'DAV:propfind body has none of DAV:allprop, DAV:propname, or DAV:prop.',
      );
    }
    return body;
  } catch (error) {
    throw toInvalidRequestBody(error);
  }
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
 * @throws An {@link InvalidRequestBodyError} if `xml` isn't a well-formed
 * `DAV:propertyupdate` document.
 */
export function parseProppatchRequestBody(xml: string): ProppatchRequestBody {
  try {
    const root = parseXmlBody(xml).root();
    const rootElement = asElement(root.node);
    if (
      !rootElement ||
      rootElement.localName !== 'propertyupdate' ||
      rootElement.namespaceURI !== DAV_NAMESPACE
    ) {
      throw new InvalidRequestBodyError(
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
  } catch (error) {
    throw toInvalidRequestBody(error);
  }
}

/** One `<D:set><D:prop>` property/value pair from an Extended MKCOL request body. */
export interface MkcolSetProperty {
  property: PropertyName;
  value: string;
}

/**
 * A parsed Extended MKCOL request body (RFC 5689 §5.1): the properties
 * to set on the collection as it's created, in document order. Unlike
 * {@link ProppatchRequestBody}, there's no `remove` — `<D:mkcol>` only
 * ever contains `<D:set>` blocks (`<!ELEMENT mkcol (set+)>`).
 */
export interface MkcolRequestBody {
  properties: MkcolSetProperty[];
}

/**
 * Parses an Extended MKCOL request body into a {@link MkcolRequestBody}.
 * Structurally identical to {@link parseProppatchRequestBody}'s `set`
 * handling (a `DAV:mkcol` root instead of `DAV:propertyupdate`, and no
 * `remove` blocks to skip) — RFC 5689 reuses PROPPATCH's `<D:set><D:prop>`
 * shape verbatim (§3: "inherits ... DTD productions from
 * [RFC4918]").
 *
 * @throws An {@link InvalidRequestBodyError} if `xml` isn't a well-formed
 * `DAV:mkcol` document.
 */
export function parseMkcolRequestBody(xml: string): MkcolRequestBody {
  try {
    const root = parseXmlBody(xml).root();
    const rootElement = asElement(root.node);
    if (
      !rootElement ||
      rootElement.localName !== 'mkcol' ||
      rootElement.namespaceURI !== DAV_NAMESPACE
    ) {
      throw new InvalidRequestBodyError(
        `Expected a DAV:mkcol root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
      );
    }

    const properties: MkcolSetProperty[] = [];
    root.each((block) => {
      const blockElement = asElement(block.node);
      if (
        !blockElement ||
        blockElement.namespaceURI !== DAV_NAMESPACE ||
        blockElement.localName !== 'set'
      ) {
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
          properties.push({
            property: {
              namespace: propertyElement.namespaceURI ?? '',
              name: propertyElement.localName,
            },
            value: serializeElementChildren(propertyNode),
          });
        });
      });
    });

    return { properties };
  } catch (error) {
    throw toInvalidRequestBody(error);
  }
}
