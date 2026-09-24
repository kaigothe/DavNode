import { create } from 'xmlbuilder2';
import { asElement, type XmlNode } from '../webdav/xml/xml-value.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';
import {
  parseTimeRangeElement,
  type CalendarTimeRangeFilter,
} from './calendar-query-request.js';

/**
 * Parses a `free-busy-query` REPORT request body (RFC 4791 §9.11:
 * `<!ELEMENT free-busy-query (time-range)>`).
 *
 * @throws An `Error` (including the XML parser's own `SyntaxError` for
 * malformed input) if `xml` isn't a well-formed `CALDAV:free-busy-query`
 * document, or has no `<C:time-range>`.
 */
export function parseFreeBusyQueryRequestBody(
  xml: string,
): CalendarTimeRangeFilter {
  const root: XmlNode = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'free-busy-query' ||
    rootElement.namespaceURI !== CALDAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a CALDAV:free-busy-query root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  let timeRange: CalendarTimeRangeFilter | undefined;
  root.each((child) => {
    const element = asElement(child.node);
    if (
      element?.namespaceURI === CALDAV_NAMESPACE &&
      element.localName === 'time-range'
    ) {
      timeRange ??= parseTimeRangeElement(child);
    }
  });
  if (!timeRange) {
    throw new Error('CALDAV:free-busy-query body has no CALDAV:time-range.');
  }
  return timeRange;
}
