import { create } from 'xmlbuilder2';
import {
  asElement,
  getAttributeValue,
  type XmlNode,
} from '../webdav/xml/xml-value.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';
import {
  parseCalendarReportPropertySelection,
  parseUtcDateTime,
  type CalendarReportPropertySelection,
} from './calendar-report-request.js';

/** How `<C:time-range>` limits a match (RFC 4791 §9.9): each end open when absent, at least one always present. */
export interface CalendarTimeRangeFilter {
  /** Inclusive start, or `null` for "-infinity". */
  start: Date | null;
  /** Exclusive end, or `null` for "+infinity". */
  end: Date | null;
}

/** One `<C:text-match>` (RFC 4791 §9.7.5) — always a substring match, unlike CardDAV's `match-type`. */
export interface CalendarTextMatch {
  /** The search text, exactly as sent (normalization is the query's job). */
  value: string;
  /** `negate-condition="yes"`: match when the text does *not* match. */
  negate: boolean;
  /** The `collation` attribute, lowercased; RFC default `i;ascii-casemap`. */
  collation: string;
}

/**
 * One `<C:prop-filter>` this server can evaluate — scoped to `SUMMARY`
 * (Große Aufgabe 6, the only property `ParsedComponent` extracts). A
 * `prop-filter` on any other property, with a `param-filter`, or with a
 * property-level `<C:time-range>` is reported unsupported instead
 * (`UnsupportedCalendarFilterParts`).
 */
export interface CalendarPropFilter {
  /** Always `SUMMARY` once parsed successfully. */
  name: 'SUMMARY';
  /** `<C:is-not-defined/>`: the property must be absent. */
  isNotDefined: boolean;
  /** The single `<C:text-match>` condition, if not `isNotDefined`. */
  textMatch: CalendarTextMatch | null;
}

/**
 * What a `<C:filter>` asks for, reduced to what a single-component-type
 * (`VEVENT`-only) store can decide — see {@link classifyCalendarFilter}'s
 * doc comment.
 */
export type CalendarFilter =
  /** Every calendar object matches (an empty filter, or one that can only ever be true here). */
  | { kind: 'match-all' }
  /** No calendar object matches (a condition that can only ever be false here). */
  | { kind: 'match-none' }
  /** The `VEVENT` a calendar object holds must satisfy this. */
  | {
      kind: 'vevent';
      /** The `VEVENT`-level `<C:time-range>`, if any. */
      timeRange: CalendarTimeRangeFilter | null;
      /** The `<C:prop-filter>`s, combined by AND (RFC 4791 gives the client no combinator here, unlike CardDAV's `test`). */
      propFilters: CalendarPropFilter[];
    };

/** What a `<C:filter>` asks for that this server can't evaluate (RFC 4791 §7.7's `supported-filter` precondition). */
export interface UnsupportedCalendarFilterParts {
  /** Component or property names, as sent, that made the filter unsupported (e.g. `comp-filter[VALARM]`, or a non-`SUMMARY` `prop-filter` name). */
  names: string[];
  /** `param-filter` names, as sent — none are evaluated. */
  paramFilters: string[];
  /** Collation identifiers, as sent (lowercased), this server doesn't support. */
  collations: string[];
}

/** A parsed `<C:comp-filter>`, before it is classified into a {@link CalendarFilter}. */
interface RawCompFilter {
  name: string;
  isNotDefined: boolean;
  timeRange: CalendarTimeRangeFilter | null;
  propFilters: RawPropFilter[];
  compFilters: RawCompFilter[];
}

interface RawPropFilter {
  name: string;
  requestedName: string;
  isNotDefined: boolean;
  timeRange: CalendarTimeRangeFilter | null;
  textMatch: CalendarTextMatch | null;
  paramFilterNames: string[];
}

/** The collations RFC 4791 §7.5 requires (`i;ascii-casemap`, `i;octet`) plus RFC 4790's `default` alias for the former. */
export const SUPPORTED_CALENDAR_COLLATIONS: ReadonlySet<string> = new Set([
  'i;ascii-casemap',
  'i;octet',
  'default',
]);

/** The only property a `<C:prop-filter>` may name (RFC 4791 §7.7's `supported-filter`, scoped to what `ParsedComponent` extracts). */
const SUPPORTED_PROP_FILTER_NAME = 'SUMMARY';

/** Parses a `<C:time-range start="..." end="..."/>` (RFC 4791 §9.9) into a {@link CalendarTimeRangeFilter}. */
export function parseTimeRangeElement(
  element: XmlNode,
): CalendarTimeRangeFilter {
  const startText = getAttributeValue(element.node, 'start');
  const endText = getAttributeValue(element.node, 'end');
  const start = startText === undefined ? null : parseUtcDateTime(startText);
  const end = endText === undefined ? null : parseUtcDateTime(endText);
  if (
    (startText !== undefined && start === null) ||
    (endText !== undefined && end === null) ||
    (start === null && end === null) ||
    (start !== null && end !== null && end.getTime() <= start.getTime())
  ) {
    throw new Error(
      'CALDAV:time-range needs a valid start and/or end, with end after start.',
    );
  }
  return { start, end };
}

function parseTextMatch(element: XmlNode): CalendarTextMatch {
  const negate = getAttributeValue(element.node, 'negate-condition') ?? 'no';
  if (negate !== 'yes' && negate !== 'no') {
    throw new Error(`text-match has an invalid negate-condition "${negate}".`);
  }
  return {
    value: element.node.textContent ?? '',
    negate: negate === 'yes',
    collation: (
      getAttributeValue(element.node, 'collation') ?? 'i;ascii-casemap'
    )
      .trim()
      .toLowerCase(),
  };
}

function parsePropFilter(element: XmlNode): RawPropFilter {
  const name = getAttributeValue(element.node, 'name')?.trim();
  if (name === undefined || name === '') {
    throw new Error('prop-filter is missing its name attribute.');
  }
  const propFilter: RawPropFilter = {
    name: name.toUpperCase(),
    requestedName: name,
    isNotDefined: false,
    timeRange: null,
    textMatch: null,
    paramFilterNames: [],
  };
  element.each((child) => {
    const childElement = asElement(child.node);
    if (childElement?.namespaceURI !== CALDAV_NAMESPACE) {
      return;
    }
    if (childElement.localName === 'is-not-defined') {
      propFilter.isNotDefined = true;
    } else if (childElement.localName === 'time-range') {
      propFilter.timeRange = parseTimeRangeElement(child);
    } else if (childElement.localName === 'text-match') {
      propFilter.textMatch = parseTextMatch(child);
    } else if (childElement.localName === 'param-filter') {
      const paramName = getAttributeValue(child.node, 'name')?.trim();
      if (paramName === undefined || paramName === '') {
        throw new Error('param-filter is missing its name attribute.');
      }
      propFilter.paramFilterNames.push(paramName);
    }
  });
  return propFilter;
}

function parseCompFilter(element: XmlNode): RawCompFilter {
  const name = getAttributeValue(element.node, 'name')?.trim();
  if (name === undefined || name === '') {
    throw new Error('comp-filter is missing its name attribute.');
  }
  const compFilter: RawCompFilter = {
    name: name.toUpperCase(),
    isNotDefined: false,
    timeRange: null,
    propFilters: [],
    compFilters: [],
  };
  element.each((child) => {
    const childElement = asElement(child.node);
    if (childElement?.namespaceURI !== CALDAV_NAMESPACE) {
      return;
    }
    if (childElement.localName === 'is-not-defined') {
      compFilter.isNotDefined = true;
    } else if (childElement.localName === 'time-range') {
      compFilter.timeRange = parseTimeRangeElement(child);
    } else if (childElement.localName === 'prop-filter') {
      compFilter.propFilters.push(parsePropFilter(child));
    } else if (childElement.localName === 'comp-filter') {
      compFilter.compFilters.push(parseCompFilter(child));
    }
  });
  return compFilter;
}

/**
 * Parses a `<C:filter>` element's single `<C:comp-filter>` child (RFC
 * 4791 §9.7: `<!ELEMENT filter (comp-filter)>`) into a {@link RawCompFilter}
 * tree — pure XML structure, not yet checked against what this server
 * can evaluate.
 *
 * @throws An `Error` if there is no `comp-filter`, a `comp-filter`/
 * `prop-filter`/`param-filter` has no `name`, a `time-range` is missing
 * both bounds or has `end` not after `start`, or a `text-match` has an
 * invalid `negate-condition`.
 */
export function parseFilterElement(element: XmlNode): RawCompFilter {
  let root: RawCompFilter | undefined;
  element.each((child) => {
    const childElement = asElement(child.node);
    if (
      childElement?.namespaceURI === CALDAV_NAMESPACE &&
      childElement.localName === 'comp-filter'
    ) {
      root ??= parseCompFilter(child);
    }
  });
  if (!root) {
    throw new Error('CALDAV:filter has no CALDAV:comp-filter.');
  }
  return root;
}

/**
 * Classifies a parsed `<C:filter>` tree into a {@link CalendarFilter},
 * and collects everything it asked for that this server can't evaluate.
 *
 * RFC 4791 §9.7.1 defines a `comp-filter` as matching when the named
 * component exists in scope (or, with `is-not-defined`, when it
 * doesn't). Since this server stores only `VEVENT` calendar object
 * resources, a `comp-filter` naming any other component type is not a
 * feature gap to reject with `supported-filter` — it is simply always
 * decidable: `is-not-defined` on a type nothing ever has is `match-all`,
 * and requiring a type nothing ever has is `match-none`. What *is*
 * unsupported: more than one component named directly under `VCALENDAR`
 * (every real client sends exactly one — the type it is querying for),
 * a component nested inside `VEVENT` (e.g. `VALARM`, which nothing here
 * evaluates), a `VCALENDAR`-level `is-not-defined`/`time-range`/
 * `prop-filter` (RFC 4791 defines time-range semantics for specific
 * component/property types, not the object as a whole), and — within
 * the `VEVENT` branch — anything {@link CalendarPropFilter} itself
 * excludes: a non-`SUMMARY` `prop-filter`, a `param-filter`, a
 * property-level `time-range`, or an unsupported collation.
 *
 * Several `prop-filter`s under the same `comp-filter` combine by AND —
 * RFC 4791 gives the client no combinator to choose, unlike CardDAV's
 * `test` attribute.
 */
export function classifyCalendarFilter(root: RawCompFilter): {
  filter: CalendarFilter;
  unsupported: UnsupportedCalendarFilterParts;
} {
  const unsupported: UnsupportedCalendarFilterParts = {
    names: [],
    paramFilters: [],
    collations: [],
  };
  const unsupportedResult = (
    name: string,
  ): {
    filter: CalendarFilter;
    unsupported: UnsupportedCalendarFilterParts;
  } => {
    unsupported.names.push(name);
    return { filter: { kind: 'match-all' }, unsupported };
  };

  if (root.name !== 'VCALENDAR') {
    return unsupportedResult(`comp-filter[${root.name}]`);
  }
  if (root.isNotDefined) {
    // No stored object lacks a VCALENDAR wrapper: this can never match.
    return { filter: { kind: 'match-none' }, unsupported };
  }
  if (root.timeRange !== null || root.propFilters.length > 0) {
    return unsupportedResult('comp-filter[VCALENDAR]');
  }
  if (root.compFilters.length === 0) {
    return { filter: { kind: 'match-all' }, unsupported };
  }
  if (root.compFilters.length > 1) {
    return unsupportedResult(
      `comp-filter[${root.compFilters.map((c) => c.name).join(',')}]`,
    );
  }

  const [event] = root.compFilters;
  if (event.name !== 'VEVENT') {
    return event.isNotDefined
      ? { filter: { kind: 'match-all' }, unsupported }
      : { filter: { kind: 'match-none' }, unsupported };
  }
  if (event.isNotDefined) {
    // No stored calendar object lacks a VEVENT: this can never match.
    return { filter: { kind: 'match-none' }, unsupported };
  }
  if (event.compFilters.length > 0) {
    unsupported.names.push(
      ...event.compFilters.map((c) => `comp-filter[VEVENT/${c.name}]`),
    );
  }

  const propFilters: CalendarPropFilter[] = [];
  for (const raw of event.propFilters) {
    if (raw.name !== SUPPORTED_PROP_FILTER_NAME) {
      unsupported.names.push(raw.requestedName);
      continue;
    }
    if (raw.timeRange !== null) {
      unsupported.names.push(`prop-filter[${raw.requestedName}]/time-range`);
      continue;
    }
    unsupported.paramFilters.push(...raw.paramFilterNames);
    if (
      raw.textMatch &&
      !SUPPORTED_CALENDAR_COLLATIONS.has(raw.textMatch.collation)
    ) {
      unsupported.collations.push(raw.textMatch.collation);
    }
    propFilters.push({
      name: 'SUMMARY',
      isNotDefined: raw.isNotDefined,
      textMatch: raw.isNotDefined ? null : raw.textMatch,
    });
  }

  return {
    filter: { kind: 'vevent', timeRange: event.timeRange, propFilters },
    unsupported,
  };
}

/** A parsed `CALDAV:calendar-query` request body (RFC 4791 §9.5). */
export interface CalendarQueryRequestBody {
  /** The properties (and `calendar-data` options) to return per match. */
  selection: CalendarReportPropertySelection;
  /** The filter to apply. */
  filter: CalendarFilter;
  /** Everything the filter asked for that this server can't evaluate. */
  unsupported: UnsupportedCalendarFilterParts;
  /** The raw `<C:timezone>` text (an iCalendar object with one `VTIMEZONE`), if given — RFC 4791 §7.3's per-request floating-time zone. */
  timezoneText: string | null;
}

function parseTimezoneElement(element: XmlNode): string {
  return element.node.textContent ?? '';
}

/**
 * Parses a `calendar-query` REPORT request body.
 *
 * @throws An `Error` (including the XML parser's own `SyntaxError` for
 * malformed input, and everything {@link parseFilterElement} throws) if
 * `xml` isn't a well-formed `CALDAV:calendar-query` document, or has no
 * `<C:filter>` (RFC 4791 §9.5 requires one).
 */
export function parseCalendarQueryRequestBody(
  xml: string,
): CalendarQueryRequestBody {
  const root: XmlNode = create(xml).root();
  const rootElement = asElement(root.node);
  if (
    !rootElement ||
    rootElement.localName !== 'calendar-query' ||
    rootElement.namespaceURI !== CALDAV_NAMESPACE
  ) {
    throw new Error(
      `Expected a CALDAV:calendar-query root element, got "${rootElement?.localName ?? root.node.nodeName}" in namespace "${rootElement?.namespaceURI ?? ''}".`,
    );
  }

  let rawFilter: RawCompFilter | undefined;
  let timezoneText: string | null = null;
  root.each((child) => {
    const element = asElement(child.node);
    if (element?.namespaceURI !== CALDAV_NAMESPACE) {
      return;
    }
    if (element.localName === 'filter') {
      rawFilter = parseFilterElement(child);
    } else if (element.localName === 'timezone') {
      timezoneText = parseTimezoneElement(child);
    }
  });
  if (!rawFilter) {
    throw new Error('CALDAV:calendar-query body has no CALDAV:filter.');
  }
  const { filter, unsupported } = classifyCalendarFilter(rawFilter);

  return {
    selection: parseCalendarReportPropertySelection(root),
    filter,
    unsupported,
    timezoneText,
  };
}
