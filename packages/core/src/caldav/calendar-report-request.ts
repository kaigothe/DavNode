import type { PropertyName } from '../webdav/xml/request-parser.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import {
  asElement,
  getAttributeValue,
  type XmlNode,
} from '../webdav/xml/xml-value.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';

/**
 * Parses an iCalendar "date with UTC time" value (RFC 5545 §3.3.5,
 * `YYYYMMDDTHHMMSSZ` — what every CalDAV `start`/`end` XML attribute
 * holds, e.g. `<C:time-range>`, `<C:expand>`) into a `Date`.
 *
 * @returns The parsed instant, or `null` if `text` isn't exactly that
 * form (including a syntactically plausible but impossible date, e.g.
 * `20060231`, which `Date.UTC` would otherwise silently roll over).
 */
export function parseUtcDateTime(text: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    text.trim(),
  );
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(ms);
  // Date.UTC() normalizes an out-of-range field (e.g. day 31 in a
  // 30-day month) instead of rejecting it — reject anything that
  // didn't round-trip.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date;
}

/**
 * What a `CALDAV:calendar-data` element in a REPORT request's `<D:prop>`
 * asks for (RFC 4791 §9.6): which media type/version the client wants
 * the data in, and whether recurring instances should be individually
 * expanded.
 *
 * Scoped to what Große Aufgabe 6 asks for: `content-type`/`version` and
 * `<C:expand>`. A `<C:comp>` (partial component/property retrieval),
 * `<C:limit-recurrence-set>` or `<C:limit-freebusy-set>` child is
 * accepted but has no effect — the object is still returned in full
 * (RFC 4791 §9.6: "If the CALDAV:calendar-data XML element doesn't
 * contain any CALDAV:comp element, calendar object resources will be
 * returned in their entirety", which is what this server always does).
 */
export interface CalendarDataRequest {
  /** The `content-type` attribute as sent; `undefined` when absent. */
  contentType: string | undefined;
  /** The `version` attribute as sent; `undefined` when absent. */
  version: string | undefined;
  /**
   * The `<C:expand>` element's `start`/`end`, if present — recurring
   * instances are returned individually rather than as a single
   * RRULE-carrying document (RFC 4791 §9.6.5).
   */
  expand: { start: Date; end: Date } | undefined;
}

/** The qualified name `CALDAV:calendar-data`, as it appears in {@link CalendarReportPropertySelection}'s property list. */
export const CALENDAR_DATA_PROPERTY: PropertyName = {
  namespace: CALDAV_NAMESPACE,
  name: 'calendar-data',
};

/**
 * Which properties a CalDAV REPORT request wants for each result (RFC
 * 4791 `(DAV:allprop | DAV:propname | DAV:prop)?`): every live property,
 * only their names, or an explicit list. `properties` of the `prop` form
 * includes `CALDAV:calendar-data` at its request position; its options
 * are in `calendarData`.
 */
export type CalendarReportPropertySelection =
  | { kind: 'allprop' }
  | { kind: 'propname' }
  | {
      kind: 'prop';
      properties: PropertyName[];
      calendarData: CalendarDataRequest | null;
    };

/**
 * Thrown by {@link parseCalendarReportPropertySelection} for an
 * `<C:expand>` whose `start`/`end` don't parse, or whose `end` isn't
 * after `start` (RFC 4791 §9.6.5).
 */
export class InvalidExpandRangeError extends Error {}

function parseExpand(element: XmlNode): { start: Date; end: Date } {
  const startText = getAttributeValue(element.node, 'start');
  const endText = getAttributeValue(element.node, 'end');
  const start = startText === undefined ? null : parseUtcDateTime(startText);
  const end = endText === undefined ? null : parseUtcDateTime(endText);
  if (start === null || end === null || end.getTime() <= start.getTime()) {
    throw new InvalidExpandRangeError(
      'CALDAV:expand needs valid start/end attributes with end after start.',
    );
  }
  return { start, end };
}

function parseCalendarData(element: XmlNode): CalendarDataRequest {
  let expand: { start: Date; end: Date } | undefined;
  element.each((child) => {
    const childElement = asElement(child.node);
    if (
      childElement?.namespaceURI === CALDAV_NAMESPACE &&
      childElement.localName === 'expand'
    ) {
      expand = parseExpand(child);
    }
  });
  return {
    contentType: getAttributeValue(element.node, 'content-type'),
    version: getAttributeValue(element.node, 'version'),
    expand,
  };
}

/**
 * Reads the `DAV:allprop`/`DAV:propname`/`DAV:prop` child of a
 * `calendar-query` or `calendar-multiget` request body's `root` element
 * into a {@link CalendarReportPropertySelection}. A request with none of
 * the three means `allprop` (RFC 4791 marks all three optional, mirroring
 * PROPFIND).
 *
 * @throws {@link InvalidExpandRangeError} If a `<C:calendar-data>` has an
 * `<C:expand>` with an invalid or empty range.
 */
export function parseCalendarReportPropertySelection(
  root: XmlNode,
): CalendarReportPropertySelection {
  let selection: CalendarReportPropertySelection = { kind: 'allprop' };
  root.each((child) => {
    const element = asElement(child.node);
    if (element?.namespaceURI !== DAV_NAMESPACE) {
      return;
    }
    if (element.localName === 'allprop') {
      selection = { kind: 'allprop' };
    } else if (element.localName === 'propname') {
      selection = { kind: 'propname' };
    } else if (element.localName === 'prop') {
      const properties: PropertyName[] = [];
      let calendarData: CalendarDataRequest | null = null;
      child.each((propertyNode) => {
        const propertyElement = asElement(propertyNode.node);
        if (!propertyElement) {
          return;
        }
        const name: PropertyName = {
          namespace: propertyElement.namespaceURI ?? '',
          name: propertyElement.localName,
        };
        if (
          name.namespace === CALENDAR_DATA_PROPERTY.namespace &&
          name.name === CALENDAR_DATA_PROPERTY.name
        ) {
          calendarData = parseCalendarData(propertyNode);
        }
        properties.push(name);
      });
      selection = { kind: 'prop', properties, calendarData };
    }
  });
  return selection;
}
