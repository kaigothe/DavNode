import { create } from 'xmlbuilder2';
import {
  DAV_PREFIX,
  groupByStatus,
  statusLine,
  type MultistatusPropertyResult,
} from '../webdav/xml/multistatus-builder.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { embedRawXmlContent } from '../webdav/xml/xml-value.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';

/**
 * Builds the `<C:mkcalendar-response>` body of a successful `MKCALENDAR`
 * (RFC 4791 §5.3.1: "If a response body for a successful request is
 * included, it MUST be a CALDAV:mkcalendar-response XML element",
 * `<!ELEMENT mkcalendar-response ANY>`). Its content is left to the
 * server; this one mirrors Extended MKCOL's `<D:mkcol-response>`
 * (`buildMkcolResponse`): one `<D:propstat>` per distinct status among
 * `properties`, naming the properties that took effect — plus a value
 * where the effective one is not simply the requested one (see
 * `MkcalendarInterpretation`).
 */
export function buildMkcalendarResponse(
  properties: readonly MultistatusPropertyResult[],
): string {
  const doc = create({ version: '1.0', encoding: 'utf-8' }).ele(
    CALDAV_NAMESPACE,
    'C:mkcalendar-response',
  );

  for (const [status, group] of groupByStatus([...properties])) {
    const propstat = doc.ele(DAV_NAMESPACE, `${DAV_PREFIX}:propstat`);
    const prop = propstat.ele(DAV_NAMESPACE, `${DAV_PREFIX}:prop`);
    for (const property of group) {
      const propertyElement = prop.ele(property.namespace, property.name);
      if (property.value !== undefined) {
        embedRawXmlContent(propertyElement, property.value);
      }
    }
    propstat.ele(DAV_NAMESPACE, `${DAV_PREFIX}:status`).txt(statusLine(status));
  }

  return doc.end();
}
