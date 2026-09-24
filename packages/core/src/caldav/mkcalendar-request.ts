import { create } from 'xmlbuilder2';
import {
  DAV_NAMESPACE,
  type PropertyName,
} from '../webdav/xml/request-parser.js';
import {
  asElement,
  getAttributeValue,
  serializeElementChildren,
} from '../webdav/xml/xml-value.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';

/** A direct child element of a `MKCALENDAR` property, e.g. one `CALDAV:comp` of a component set. */
export interface MkcalendarChildElement {
  /** The child's XML namespace URI. */
  namespace: string;
  /** The child's local name. */
  name: string;
  /** The child's `name` attribute (what `<C:comp name="VEVENT"/>` carries), if any. */
  nameAttribute?: string;
}

/** One `<D:set><D:prop>` property from a `MKCALENDAR` request body. */
export interface MkcalendarSetProperty {
  /** The property's qualified name. */
  property: PropertyName;
  /**
   * The property's content in the form a dead property is stored in
   * (plain text pre-escaped, nested elements serialized; see
   * `serializeElementChildren`).
   */
  value: string;
  /**
   * The property's text content with entities and `CDATA` resolved — the
   * exact iCalendar text of a `calendar-timezone`, or the plain string
   * of a `displayname`.
   */
  text: string;
  /** The property's direct child elements, in document order. */
  children: MkcalendarChildElement[];
}

/** A parsed `MKCALENDAR` request body: the properties to set, in document order. */
export interface MkcalendarRequestBody {
  properties: MkcalendarSetProperty[];
}

/**
 * Why a `MKCALENDAR` body was refused: `malformed` is `400` (not
 * well-formed XML, or not the structure `<!ELEMENT mkcalendar (DAV:set)>`
 * allows), `wrong-root` is `415` (well-formed XML that is not a
 * `CALDAV:mkcalendar`, RFC 4791 §5.3.1: "If a request body is included,
 * it MUST be a CALDAV:mkcalendar XML element").
 */
export type MkcalendarBodyErrorKind = 'malformed' | 'wrong-root';

/** Thrown by {@link parseMkcalendarRequestBody} for a body it can't accept. */
export class MkcalendarBodyError extends Error {
  /**
   * @param message - What is wrong with the body.
   * @param kind - Which status the refusal maps to.
   */
  constructor(
    message: string,
    readonly kind: MkcalendarBodyErrorKind,
  ) {
    super(message);
    this.name = 'MkcalendarBodyError';
  }
}

/**
 * Parses a `MKCALENDAR` request body (RFC 4791 §5.3.1,
 * `<!ELEMENT mkcalendar (DAV:set)>`) into the properties it sets. Like
 * Extended MKCOL's {@link parseMkcolRequestBody} — the shape is the same
 * `<D:set><D:prop>` PROPPATCH uses, under a `CALDAV:mkcalendar` root —
 * but it also keeps each property's plain text and child elements, which
 * the CalDAV properties (`calendar-timezone`,
 * `supported-calendar-component-set`, `resourcetype`) are interpreted
 * from. Several `DAV:set` blocks are processed in order, as RFC 4791
 * requires ("instruction processing MUST occur in the order
 * instructions are received"); a `DAV:remove`, or any other child of the
 * root, has no meaning at creation and is refused.
 *
 * @throws {@link MkcalendarBodyError} For a body that is not a
 * well-formed `CALDAV:mkcalendar`.
 */
export function parseMkcalendarRequestBody(xml: string): MkcalendarRequestBody {
  let root: ReturnType<ReturnType<typeof create>['root']>;
  try {
    root = create(xml).root();
  } catch (error) {
    throw new MkcalendarBodyError(
      `The body is not well-formed XML: ${error instanceof Error ? error.message : String(error)}`,
      'malformed',
    );
  }
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'mkcalendar' ||
    rootElement.namespaceURI !== CALDAV_NAMESPACE
  ) {
    throw new MkcalendarBodyError(
      `Expected a CALDAV:mkcalendar root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
      'wrong-root',
    );
  }

  const properties: MkcalendarSetProperty[] = [];
  const unexpected: string[] = [];
  root.each((block) => {
    const blockElement = asElement(block.node);
    if (!blockElement) {
      return;
    }
    if (
      blockElement.namespaceURI !== DAV_NAMESPACE ||
      blockElement.localName !== 'set'
    ) {
      unexpected.push(
        `{${blockElement.namespaceURI ?? ''}}${blockElement.localName}`,
      );
      return;
    }
    block.each((propGroup) => {
      const propGroupElement = asElement(propGroup.node);
      if (
        !propGroupElement ||
        propGroupElement.namespaceURI !== DAV_NAMESPACE ||
        propGroupElement.localName !== 'prop'
      ) {
        return;
      }
      propGroup.each((propertyNode) => {
        const propertyElement = asElement(propertyNode.node);
        if (!propertyElement) {
          return;
        }
        const children: MkcalendarChildElement[] = [];
        propertyNode.each((childNode) => {
          const childElement = asElement(childNode.node);
          if (childElement) {
            children.push({
              namespace: childElement.namespaceURI ?? '',
              name: childElement.localName,
              nameAttribute: getAttributeValue(childNode.node, 'name'),
            });
          }
        });
        properties.push({
          property: {
            namespace: propertyElement.namespaceURI ?? '',
            name: propertyElement.localName,
          },
          value: serializeElementChildren(propertyNode),
          text: propertyNode.node.textContent ?? '',
          children,
        });
      });
    });
  });
  if (unexpected.length > 0) {
    throw new MkcalendarBodyError(
      `A CALDAV:mkcalendar may only contain DAV:set, found ${unexpected.join(', ')}.`,
      'malformed',
    );
  }
  return { properties };
}
