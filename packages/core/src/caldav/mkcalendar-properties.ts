import {
  CALENDAR_COMPONENT_TYPES,
  type CalendarComponentType,
} from '../entities/calendar-collection.entity.js';
import type { PropertyValue } from '../webdav/properties/property-provider.interface.js';
import type { MultistatusPropertyResult } from '../webdav/xml/multistatus-builder.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';
import { serializeComponentSet } from './calendar-live-properties.js';
import { codePointLength, MAX_CALENDAR_NAME_LENGTH } from './calendar-name.js';
import { parseCalendarTimezone } from './calendar-timezone.js';
import { CalendarParseError } from './icalendar-parser.js';
import type { MkcalendarSetProperty } from './mkcalendar-request.js';

/** What a `MKCALENDAR` request initializes on the new calendar, beyond its URL name. */
export interface CalendarInitialization {
  /** The requested `DAV:displayname`, or `null` to default to the URL name. */
  displayName: string | null;
  /** The requested `CALDAV:calendar-description`, if any. */
  description: string | null;
  /** The requested `CALDAV:calendar-timezone` (validated iCalendar text), if any. */
  timezone: string | null;
  /** The component types the calendar will accept — never empty, only supported types. */
  supportedComponentSet: CalendarComponentType[];
  /** Client-defined properties (custom namespaces) to store verbatim as dead properties. */
  deadProperties: PropertyValue[];
}

/** The outcome of {@link interpretMkcalendarProperties}. */
export type MkcalendarInterpretation =
  | {
      outcome: 'accepted';
      initialization: CalendarInitialization;
      /** Every requested property with status `200`, for the `mkcalendar-response`. */
      results: MultistatusPropertyResult[];
    }
  | {
      /** `CALDAV:valid-calendar-data` is violated: the calendar must not be created. */
      outcome: 'invalid-timezone';
      message: string;
    }
  | {
      /** At least one instruction can't be executed: none is, and the request answers `207`. */
      outcome: 'rejected';
      /** Every requested property: the failing ones with their own status, the rest `424`. */
      results: MultistatusPropertyResult[];
    };

/** Result of classifying one requested property. */
type Classified =
  { kind: 'applied'; value?: string } | { kind: 'rejected'; status: 403 | 409 };

const ALL_SUPPORTED_COMPONENTS: readonly CalendarComponentType[] =
  CALENDAR_COMPONENT_TYPES;

/**
 * The component types a calendar ends up with for a requested
 * `CALDAV:supported-calendar-component-set` (RFC 4791 §5.2.3): the
 * requested ones this server stores (today only `VEVENT`), or every
 * supported type when none of the requested ones is — v1 doesn't fail
 * `MKCALENDAR` over `VTODO`/`VJOURNAL`, it creates a `VEVENT` calendar
 * (milestones/M6-caldav/00-setting-goal.md). Names compare
 * case-insensitively; `VTIMEZONE` is never part of the set (§5.2.3:
 * only for objects holding nothing else).
 */
function effectiveComponentSet(
  requested: readonly string[],
): CalendarComponentType[] {
  const wanted = new Set(requested.map((name) => name.toUpperCase()));
  const supported = CALENDAR_COMPONENT_TYPES.filter((type) => wanted.has(type));
  return supported.length > 0 ? supported : [...ALL_SUPPORTED_COMPONENTS];
}

/**
 * Interprets the `<D:set><D:prop>` instructions of a `MKCALENDAR` request
 * (RFC 4791 §5.3.1) into the state of the calendar to create — without
 * touching the database, so the caller can create everything or nothing.
 *
 * What a client can set at creation:
 *
 * - `DAV:displayname` (blank ⇒ the URL name is used),
 *   `CALDAV:calendar-description` and `CALDAV:calendar-timezone`;
 * - `CALDAV:supported-calendar-component-set` — protected afterwards, but
 *   "clients can initialize the value of this property when creating a
 *   new calendar collection with MKCALENDAR" (§5.2.3), reduced by
 *   `effectiveComponentSet`;
 * - `DAV:resourcetype`, but only as the calendar's own type: it must
 *   contain `CALDAV:calendar` (the postcondition
 *   `initialize-calendar-collection` demands `DAV:collection` +
 *   `CALDAV:calendar` anyway), anything else can't be honoured;
 * - any property in a namespace of the client's own (e.g. Apple's
 *   `calendar-color`), stored as a dead property.
 *
 * Every other property in the `DAV:` and `CALDAV:` namespaces is one the
 * server defines itself — live or protected (`creationdate`,
 * `getetag`, `acl`, `supported-calendar-data`, `calendar-home-set`, …) —
 * and is refused with `403`; storing it as a dead property would let a
 * client forge what the server reports. A `displayname` or a property
 * name longer than the database columns hold is `409`.
 *
 * A timezone that is not a valid iCalendar object with a single
 * `VTIMEZONE` violates `CALDAV:valid-calendar-data` and is reported as
 * `invalid-timezone`, before any per-property rejection. A property
 * appearing twice takes its last value (instructions run in order).
 *
 * All-or-nothing (§5.3.1): with any rejected property the result lists
 * *every* property, the failing ones with their status and the others
 * `424 Failed Dependency`.
 */
export function interpretMkcalendarProperties(
  properties: readonly MkcalendarSetProperty[],
): MkcalendarInterpretation {
  const latest = new Map<string, MkcalendarSetProperty>();
  for (const entry of properties) {
    latest.set(
      `${entry.property.namespace}\u0000${entry.property.name}`,
      entry,
    );
  }

  const initialization: CalendarInitialization = {
    displayName: null,
    description: null,
    timezone: null,
    supportedComponentSet: [...ALL_SUPPORTED_COMPONENTS],
    deadProperties: [],
  };

  const classify = (entry: MkcalendarSetProperty): Classified => {
    const { namespace, name } = entry.property;

    if (namespace === DAV_NAMESPACE && name === 'displayname') {
      const displayName = entry.text.trim();
      if (codePointLength(displayName) > MAX_CALENDAR_NAME_LENGTH) {
        return { kind: 'rejected', status: 409 };
      }
      initialization.displayName = displayName === '' ? null : displayName;
      return { kind: 'applied' };
    }
    if (namespace === DAV_NAMESPACE && name === 'resourcetype') {
      const isCalendar = entry.children.some(
        (child) =>
          child.namespace === CALDAV_NAMESPACE && child.name === 'calendar',
      );
      return isCalendar
        ? { kind: 'applied' }
        : { kind: 'rejected', status: 409 };
    }
    if (namespace === CALDAV_NAMESPACE && name === 'calendar-description') {
      initialization.description = entry.text;
      return { kind: 'applied' };
    }
    if (namespace === CALDAV_NAMESPACE && name === 'calendar-timezone') {
      initialization.timezone = entry.text;
      return { kind: 'applied' };
    }
    if (
      namespace === CALDAV_NAMESPACE &&
      name === 'supported-calendar-component-set'
    ) {
      initialization.supportedComponentSet = effectiveComponentSet(
        entry.children
          .filter(
            (child) =>
              child.namespace === CALDAV_NAMESPACE &&
              child.name === 'comp' &&
              child.nameAttribute !== undefined,
          )
          .map((child) => child.nameAttribute as string),
      );
      return {
        kind: 'applied',
        value: serializeComponentSet(initialization.supportedComponentSet),
      };
    }
    if (namespace === DAV_NAMESPACE || namespace === CALDAV_NAMESPACE) {
      return { kind: 'rejected', status: 403 };
    }
    if (
      codePointLength(namespace) > MAX_CALENDAR_NAME_LENGTH ||
      codePointLength(name) > MAX_CALENDAR_NAME_LENGTH
    ) {
      return { kind: 'rejected', status: 409 };
    }
    initialization.deadProperties.push({ namespace, name, value: entry.value });
    return { kind: 'applied' };
  };

  const classified = [...latest.values()].map((entry) => ({
    entry,
    result: classify(entry),
  }));

  if (initialization.timezone !== null) {
    try {
      parseCalendarTimezone(initialization.timezone);
    } catch (error) {
      if (error instanceof CalendarParseError) {
        return { outcome: 'invalid-timezone', message: error.message };
      }
      throw error;
    }
  }

  if (classified.some(({ result }) => result.kind === 'rejected')) {
    return {
      outcome: 'rejected',
      results: classified.map(({ entry, result }) => ({
        ...entry.property,
        status: result.kind === 'rejected' ? result.status : 424,
      })),
    };
  }
  return {
    outcome: 'accepted',
    initialization,
    results: classified.map(({ entry, result }) => ({
      ...entry.property,
      ...(result.kind === 'applied' && result.value !== undefined
        ? { value: result.value }
        : {}),
      status: 200,
    })),
  };
}
