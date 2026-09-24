import { In, type EntityManager } from 'typeorm';
import { CalendarCollection } from '../entities/calendar-collection.entity.js';
import { CalendarObjectContent } from '../entities/calendar-object-content.entity.js';
import { CalendarObject } from '../entities/calendar-object.entity.js';
import { PropertyProviderRegistry } from '../webdav/properties/property-provider-registry.js';
import type {
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';
import type { ReportContext, ReportResult } from '../webdav/report-registry.js';
import { buildErrorResponse } from '../webdav/xml/error-response-builder.js';
import type {
  MultistatusPropertyResult,
  MultistatusResourceResult,
} from '../webdav/xml/multistatus-builder.js';
import { escapeXmlText } from '../webdav/xml/xml-value.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';
import { renderExpandedCalendarData } from './calendar-data-expand.js';
import { toCalendarObjectUrl, toCalendarUrl } from './calendar-home-url.js';
import { CalendarObjectLiveProperties } from './calendar-object-live-properties.js';
import {
  CALENDAR_DATA_PROPERTY,
  type CalendarDataRequest,
  type CalendarReportPropertySelection,
} from './calendar-report-request.js';
import { CalendarParseError, parseCalendarObject } from './icalendar-parser.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a CalDAV REPORT's Request-URI —
 * `/dav/{tenant}/calendars/{userId}/{calendarName}`, with or without a
 * trailing slash — to that `CalendarCollection`, the same lookup the
 * calendar-object routes do (by owner id and `name`, the URL identity).
 * Any other path — the home collection, an object, another tree —
 * resolves to `null`. The calendar counterpart of
 * `resolveReportAddressbook`.
 *
 * A `{userId}` that isn't a UUID can't match any owner and is answered
 * `null` without querying: Postgres would otherwise reject the malformed
 * uuid comparison with a driver error (a `500`), where the other drivers
 * simply find nothing.
 *
 * @param context - The REPORT's request context.
 */
export async function resolveReportCalendar(
  context: ReportContext,
): Promise<CalendarCollection | null> {
  const segments = [...context.segments];
  if (segments.at(-1) === '') {
    segments.pop();
  }
  const [tree, ownerPrincipalId, calendarName, ...rest] = segments;
  if (
    tree !== 'calendars' ||
    ownerPrincipalId === undefined ||
    !UUID_PATTERN.test(ownerPrincipalId) ||
    calendarName === undefined ||
    calendarName === '' ||
    rest.length > 0
  ) {
    return null;
  }
  return context.manager.getRepository(CalendarCollection).findOneBy({
    tenantId: context.tenant.id,
    ownerPrincipalId,
    name: calendarName,
  });
}

/** The `text/calendar` media type version this server stores objects in (RFC 4791 always `2.0`) — see {@link checkSupportedCalendarData}. */
const SUPPORTED_CALENDAR_VERSION = '2.0';

/** How many calendar object ids one `IN (...)` content lookup carries — well below every supported driver's bound-parameter limit. */
const CONTENT_LOOKUP_CHUNK_SIZE = 500;

const liveProperties = new PropertyProviderRegistry<CalendarObject>();
liveProperties.register(new CalendarObjectLiveProperties());

/**
 * Checks a request's `CALDAV:calendar-data` attributes against what this
 * server stores: `content-type` must be `text/calendar` and `version`
 * `2.0` (RFC 4791 §7.8/§7.9's `supported-calendar-data` precondition).
 * Absent attributes are always fine.
 *
 * @returns `null` if the request is acceptable, else the complete `403`
 * result naming the violated precondition.
 */
export function checkSupportedCalendarData(
  selection: CalendarReportPropertySelection,
): ReportResult | null {
  if (selection.kind !== 'prop' || selection.calendarData === null) {
    return null;
  }
  const { contentType, version } = selection.calendarData;
  const contentTypeSupported =
    contentType === undefined ||
    contentType.trim().toLowerCase() === 'text/calendar';
  const versionSupported =
    version === undefined || version.trim() === SUPPORTED_CALENDAR_VERSION;
  if (contentTypeSupported && versionSupported) {
    return null;
  }
  return {
    status: 403,
    body: buildErrorResponse([
      { namespace: CALDAV_NAMESPACE, name: 'supported-calendar-data' },
    ]),
  };
}

/** The raw iCalendar text of each of `calendarObjectIds`, keyed by id. */
async function loadIcsData(
  manager: EntityManager,
  calendarObjectIds: readonly string[],
): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  for (
    let start = 0;
    start < calendarObjectIds.length;
    start += CONTENT_LOOKUP_CHUNK_SIZE
  ) {
    const rows = await manager.getRepository(CalendarObjectContent).findBy({
      calendarObjectId: In(
        calendarObjectIds.slice(start, start + CONTENT_LOOKUP_CHUNK_SIZE),
      ),
    });
    for (const row of rows) {
      byId.set(row.calendarObjectId, row.icsData);
    }
  }
  return byId;
}

/**
 * The `CALDAV:calendar-data` value of one calendar object: the text as
 * stored, or, with `<C:expand>`, its occurrences in the requested range
 * individually ({@link renderExpandedCalendarData}) — or `null` when the
 * request named a `version` this object can't be served in (there is no
 * iCalendar version conversion, so any `version` other than `2.0`, the
 * only one ever stored, fails).
 *
 * A body that (unexpectedly) no longer parses — this server's own PUT
 * already validated it — falls back to the stored text unexpanded rather
 * than failing the whole response over one object.
 */
function renderCalendarData(
  ics: string,
  request: CalendarDataRequest,
  floatingTimeZone: string | null,
): string | null {
  if (
    request.version !== undefined &&
    request.version.trim() !== SUPPORTED_CALENDAR_VERSION
  ) {
    return null;
  }
  if (!request.expand) {
    return escapeXmlText(ics);
  }
  try {
    const parsed = parseCalendarObject(ics);
    const expanded = renderExpandedCalendarData(
      ics,
      parsed,
      request.expand.start,
      request.expand.end,
      floatingTimeZone,
    );
    return escapeXmlText(expanded);
  } catch (error) {
    if (error instanceof CalendarParseError) {
      return escapeXmlText(ics);
    }
    throw error;
  }
}

/**
 * Builds the `<D:response>` entries for `calendarObjects` — the property
 * selection logic `calendar-multiget` and `calendar-query` share (RFC
 * 4791 §7.8: "modeled on the PROPFIND method"):
 *
 * - `allprop`: every live property (`CalendarObjectLiveProperties`);
 * - `propname`: those properties' names, without values;
 * - `prop`: each requested property as a `200`, or a `404` propstat for
 *   one the server doesn't define (dead properties don't exist for
 *   calendar objects yet, so nothing else can match). `CALDAV:calendar-data`
 *   is resolved here rather than by a property provider: RFC 4791 §9.6
 *   stresses it "is not a WebDAV property" and mustn't appear in
 *   PROPFIND.
 *
 * The iCalendar text is loaded (one query per {@link CONTENT_LOOKUP_CHUNK_SIZE}
 * objects) only when `calendar-data` is actually requested; a
 * `<C:expand>` request additionally re-parses each returned object to
 * render its occurrences.
 *
 * @param context - The REPORT's request context.
 * @param calendar - The calendar `calendarObjects` belong to.
 * @param calendarObjects - The objects to render, in response order.
 * @param selection - The properties the request asked for.
 * @param floatingTimeZone - See `resolveReportFloatingTimeZone` — only
 * used when `selection` requests `<C:expand>`.
 */
export async function buildCalendarObjectResponses(
  context: ReportContext,
  calendar: CalendarCollection,
  calendarObjects: readonly CalendarObject[],
  selection: CalendarReportPropertySelection,
  floatingTimeZone: string | null = null,
): Promise<MultistatusResourceResult[]> {
  const propertyContext: PropertyProviderContext = {
    tenant: context.tenant,
    principal: context.principal,
    manager: context.manager,
  };
  const wantsCalendarData =
    selection.kind === 'prop' && selection.calendarData !== null;
  const icsByObject = wantsCalendarData
    ? await loadIcsData(
        context.manager,
        calendarObjects.map((object) => object.id),
      )
    : new Map<string, string>();

  const responses: MultistatusResourceResult[] = [];
  for (const object of calendarObjects) {
    const href = toCalendarObjectUrl(calendar, object.name, context.tenant);
    const live: PropertyValue[] = await liveProperties.listLiveProperties(
      object,
      propertyContext,
    );

    if (selection.kind === 'allprop') {
      responses.push({
        href,
        properties: live.map((property) => ({ ...property, status: 200 })),
      });
      continue;
    }
    if (selection.kind === 'propname') {
      responses.push({
        href,
        properties: live.map(({ namespace, name }) => ({
          namespace,
          name,
          status: 200,
        })),
      });
      continue;
    }

    const properties: MultistatusPropertyResult[] = [];
    let conversionFailed = false;
    for (const requested of selection.properties) {
      if (
        requested.namespace === CALENDAR_DATA_PROPERTY.namespace &&
        requested.name === CALENDAR_DATA_PROPERTY.name &&
        selection.calendarData !== null
      ) {
        const ics = icsByObject.get(object.id);
        if (ics === undefined) {
          properties.push({ ...requested, status: 404 });
          continue;
        }
        const value = renderCalendarData(
          ics,
          selection.calendarData,
          floatingTimeZone,
        );
        if (value === null) {
          conversionFailed = true;
          break;
        }
        properties.push({ ...requested, value, status: 200 });
        continue;
      }
      const found = live.find(
        (property) =>
          property.namespace === requested.namespace &&
          property.name === requested.name,
      );
      properties.push(
        found ? { ...found, status: 200 } : { ...requested, status: 404 },
      );
    }

    responses.push(
      conversionFailed
        ? {
            href,
            properties: [],
            status: 415,
            error: [
              {
                namespace: CALDAV_NAMESPACE,
                name: 'supported-calendar-data-conversion',
              },
            ],
          }
        : { href, properties },
    );
  }
  return responses;
}

const OBJECT_NAME_LOOKUP_CHUNK_SIZE = 500;

/**
 * The decoded path segments of `href` (an absolute path or absolute
 * URL, RFC 4918 §8.3) — `null` if it can't be parsed or has a malformed
 * percent-escape. Shared logic with the addressbook REPORTs'
 * `toPathSegments`, kept as its own copy here since the two domains have
 * no common module to share it from without a speculative refactor.
 */
function toPathSegments(href: string): string[] | null {
  let pathname: string;
  try {
    pathname = new URL(href, 'http://localhost').pathname;
  } catch {
    return null;
  }
  try {
    return pathname.split('/').slice(1).map(decodeURIComponent);
  } catch {
    return null;
  }
}

/**
 * The calendar object name `href` addresses, provided it is exactly one
 * segment below the calendar (`calendarSegments`) — else `null`: another
 * calendar, another user, another tree, the calendar itself, or a deeper
 * path all address nothing *inside this calendar*.
 */
export function calendarObjectNameOf(
  href: string,
  calendarSegments: readonly string[],
): string | null {
  const segments = toPathSegments(href);
  if (
    segments === null ||
    segments.length !== calendarSegments.length + 1 ||
    !calendarSegments.every((segment, index) => segments[index] === segment)
  ) {
    return null;
  }
  const name = segments[segments.length - 1];
  return name === '' ? null : name;
}

/** The calendar objects of `calendarId` named in `names`, batched in `IN (...)` chunks. */
export async function findCalendarObjectsByName(
  manager: EntityManager,
  calendarId: string,
  names: readonly string[],
): Promise<CalendarObject[]> {
  const found: CalendarObject[] = [];
  for (
    let start = 0;
    start < names.length;
    start += OBJECT_NAME_LOOKUP_CHUNK_SIZE
  ) {
    found.push(
      ...(await manager.getRepository(CalendarObject).findBy({
        calendarId,
        name: In(names.slice(start, start + OBJECT_NAME_LOOKUP_CHUNK_SIZE)),
      })),
    );
  }
  return found;
}

export { toCalendarUrl };
