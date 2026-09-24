import { create } from 'xmlbuilder2';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { asElement, type XmlNode } from '../webdav/xml/xml-value.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';
import {
  parseCalendarReportPropertySelection,
  type CalendarReportPropertySelection,
} from './calendar-report-request.js';

/** A parsed `CALDAV:calendar-multiget` request body (RFC 4791 §7.9/§9.10). */
export interface CalendarMultigetRequestBody {
  /** The properties (and `calendar-data` options) to return per calendar object. */
  selection: CalendarReportPropertySelection;
  /** The `<D:href>` values, trimmed, in request order. Never empty. */
  hrefs: string[];
}

/**
 * Parses a `calendar-multiget` REPORT request body.
 *
 * @throws An `Error` (including the XML parser's own `SyntaxError` for
 * malformed input) if `xml` isn't a well-formed `CALDAV:calendar-multiget`
 * document, or has no `<D:href>` (RFC 4791 §9.10: `DAV:href+`).
 */
export function parseCalendarMultigetRequestBody(
  xml: string,
): CalendarMultigetRequestBody {
  const root: XmlNode = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'calendar-multiget' ||
    rootElement.namespaceURI !== CALDAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a CALDAV:calendar-multiget root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  const hrefs: string[] = [];
  root.each((child) => {
    const element = asElement(child.node);
    if (
      element?.namespaceURI === DAV_NAMESPACE &&
      element.localName === 'href'
    ) {
      hrefs.push((child.node.textContent ?? '').trim());
    }
  });
  if (hrefs.length === 0) {
    throw new Error('CALDAV:calendar-multiget body has no DAV:href.');
  }

  return { selection: parseCalendarReportPropertySelection(root), hrefs };
}
