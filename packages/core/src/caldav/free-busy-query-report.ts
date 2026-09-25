import { In, type EntityManager } from 'typeorm';
import {
  hasCalendarPrivilege,
  selectCalendarObjectsWithPrivilege,
} from '../acl/evaluate-privilege.js';
import type { CalendarCollection } from '../entities/calendar-collection.entity.js';
import { CalendarObjectContent } from '../entities/calendar-object-content.entity.js';
import { CalendarObject } from '../entities/calendar-object.entity.js';
import type { Principal } from '../entities/principal.entity.js';
import type {
  ReportContext,
  ReportHandler,
  ReportResult,
} from '../webdav/report-registry.js';
import { resolveReportFloatingTimeZone } from './calendar-query-timezone.js';
import { FLOATING_TIME_OFFSET_BOUNDS_MS } from './index-calendar-object.js';
import {
  expandOccurrences,
  RecurrenceLimitError,
  type Occurrence,
} from './expand-recurrence.js';
import {
  CalendarParseError,
  parseCalendarObject,
  type ParsedCalendarObject,
} from './icalendar-parser.js';
import { parseFreeBusyQueryRequestBody } from './free-busy-query-request.js';
import { resolveReportCalendar } from './calendar-report-support.js';

/** Most rows one database round trip fetches while walking a calendar's objects. */
const PAGE_SIZE = 200;

/** One coalesced busy interval, already typed by `FBTYPE`. */
export interface BusyInterval {
  start: number;
  end: number;
  fbtype: 'BUSY' | 'BUSY-TENTATIVE';
}

/**
 * `occurrence`'s `FBTYPE` (RFC 4791 §7.10's table) — `null` when it
 * doesn't count as busy at all: `TRANSPARENT`, or `CANCELLED` (checked
 * per occurrence, not per object, since one override can cancel or make
 * transparent a single instance without affecting the rest of the
 * series).
 */
function busyTypeOf(occurrence: Occurrence): 'BUSY' | 'BUSY-TENTATIVE' | null {
  if (
    occurrence.transparency !== 'opaque' ||
    occurrence.status === 'cancelled'
  ) {
    return null;
  }
  return occurrence.status === 'tentative' ? 'BUSY-TENTATIVE' : 'BUSY';
}

/**
 * Every busy interval `parsed` contributes to `[rangeStart, rangeEnd)`
 * (RFC 4791 §7.4/§7.10): each actual occurrence (`expandOccurrences`,
 * the same exact Phase-2 logic `calendar-query` uses) that is opaque and
 * not cancelled becomes one interval, typed `BUSY`/`BUSY-TENTATIVE` by
 * its own `STATUS`.
 *
 * A recurrence set too large to walk to the end of the range
 * (`RecurrenceLimitError`) contributes nothing — the same "exclude
 * rather than fail the whole report" choice `calendar-query` makes.
 */
function busyIntervalsOf(
  parsed: ParsedCalendarObject,
  rangeStart: Date,
  rangeEnd: Date,
  floatingTimeZone: string | null,
): BusyInterval[] {
  let occurrences: Occurrence[];
  try {
    occurrences = expandOccurrences(parsed, rangeStart, rangeEnd, {
      floatingTimeZone,
    });
  } catch (error) {
    if (error instanceof RecurrenceLimitError) {
      return [];
    }
    throw error;
  }
  const intervals: BusyInterval[] = [];
  for (const occurrence of occurrences) {
    const fbtype = busyTypeOf(occurrence);
    if (fbtype) {
      intervals.push({
        start: occurrence.start.getTime(),
        end: occurrence.end.getTime(),
        fbtype,
      });
    }
  }
  return intervals;
}

/**
 * Coalesces `intervals` of one `FBTYPE` (RFC 4791 §7.10: "Servers SHOULD
 * coalesce consecutive or overlapping busy time periods of the same
 * type"): sorted by start, a later interval that starts at or before the
 * running block's end extends it instead of starting a new one.
 * Different `FBTYPE`s are never merged into each other (they "MAY
 * overlap").
 */
export function coalesce(intervals: readonly BusyInterval[]): BusyInterval[] {
  const byType = new Map<'BUSY' | 'BUSY-TENTATIVE', BusyInterval[]>();
  for (const interval of intervals) {
    const list = byType.get(interval.fbtype) ?? [];
    list.push(interval);
    byType.set(interval.fbtype, list);
  }

  const result: BusyInterval[] = [];
  for (const [, sameType] of byType) {
    sameType.sort((a, b) => a.start - b.start);
    // `current` is the very object already in `result` — extending it in
    // place (rather than a separate [start, end] pair) is what makes a
    // later merge actually change the interval the caller sees.
    let current: BusyInterval | null = null;
    for (const interval of sameType) {
      if (current && interval.start <= current.end) {
        current.end = Math.max(current.end, interval.end);
      } else {
        current = { ...interval };
        result.push(current);
      }
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

/** `date`, formatted as an iCalendar UTC "date with UTC time" value (`YYYYMMDDTHHMMSSZ`). */
export function formatUtc(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Builds the `text/calendar` `VCALENDAR`/`VFREEBUSY` response body (RFC 4791 §7.10.1). */
function buildFreeBusyBody(
  rangeStart: Date,
  rangeEnd: Date,
  intervals: readonly BusyInterval[],
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//CalDAV Server//EN',
    'BEGIN:VFREEBUSY',
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(rangeStart)}`,
    `DTEND:${formatUtc(rangeEnd)}`,
    ...intervals.map(
      (interval) =>
        `FREEBUSY${interval.fbtype === 'BUSY-TENTATIVE' ? ';FBTYPE=BUSY-TENTATIVE' : ''}:` +
        `${formatUtc(new Date(interval.start))}/${formatUtc(new Date(interval.end))}`,
    ),
    'END:VFREEBUSY',
    'END:VCALENDAR',
    '',
  ];
  return lines.join('\r\n');
}

/**
 * Handles the `{CALDAV:}free-busy-query` REPORT (RFC 4791 §7.10) — the
 * one CalDAV report that does **not** answer `207 Multi-Status` XML: a
 * single `text/calendar` body holding one synthesized `VFREEBUSY`
 * describing the busy time in a requested range.
 *
 * **Target**: the Request-URI must be a calendar
 * (`/dav/{tenant}/calendars/{userId}/{calendarName}`) — RFC 4791 §7.10:
 * "can only be run against a collection ... an attempt to run the report
 * on a calendar object resource MUST fail and return a 403". A path one
 * segment deeper that names an actual object of an existing, accessible
 * calendar gets exactly that `403`; anything else unresolvable is `404`.
 *
 * **Authorization**: `CALDAV:read-free-busy` *or* `DAV:read` — a single
 * `hasCalendarPrivilege(..., 'read-free-busy')` check covers both, since
 * the ACL engine already aggregates `read-free-busy` under `read`/`all`
 * (RFC 4791 §6.1.1, Große Aufgabe 5). Denied is `404`, not `403` — RFC
 * 4791 §7.10 is explicit: "This restriction will prevent users from
 * discovering URLs of resources for which they are only granted the
 * CALDAV:read-free-busy privilege" — so a stranger can't tell a calendar
 * they may query free/busy on from one that doesn't exist at all. Each
 * matching object is additionally checked for the same privilege on
 * itself (an object's own ACEs can deny what the calendar grants),
 * exactly like `calendar-query`'s per-object `read` check.
 *
 * **Matching**: the same Phase-1 database prefilter and Phase-2
 * `expandOccurrences` `calendar-query` uses, but every occurrence is
 * additionally required to be opaque and not cancelled
 * (`busyTypeOf`) — checked per occurrence, since one override can cancel
 * or make transparent a single instance without affecting its series.
 * Every busy interval found is coalesced per `FBTYPE`
 * (`BUSY`/`BUSY-TENTATIVE`, derived from `STATUS` per RFC 4791 §7.10's
 * table) into the fewest overlapping-or-adjacent blocks (`coalesce`).
 * `<C:timezone>` isn't part of this report's own request body (RFC 4791
 * §9.11); floating/`DATE` values resolve via the target calendar's own
 * `calendar-timezone`, else UTC (`resolveReportFloatingTimeZone`).
 *
 * A `<C:time-range>` is required (RFC 4791 §9.11: `(time-range)`, not
 * optional) — missing or malformed is `400`.
 */
export class FreeBusyQueryReportHandler implements ReportHandler {
  /** See {@link ReportHandler.handle}. */
  async handle(
    requestXml: string,
    context: ReportContext,
  ): Promise<ReportResult> {
    const segments = [...context.segments];
    if (segments.at(-1) === '') {
      segments.pop();
    }
    const calendar = await resolveReportCalendar(context);
    if (!calendar) {
      const parentIsCalendar = await resolveReportCalendar({
        ...context,
        segments: segments.slice(0, -1),
      });
      if (parentIsCalendar) {
        return { status: 403, body: '' };
      }
      return { status: 404, body: '' };
    }
    if (
      !(await hasCalendarPrivilege(
        context.manager,
        context.principal,
        calendar,
        'read-free-busy',
      ))
    ) {
      return { status: 404, body: '' };
    }

    let timeRange;
    try {
      timeRange = parseFreeBusyQueryRequestBody(requestXml);
    } catch {
      return { status: 400, body: '' };
    }
    if (timeRange.start === null || timeRange.end === null) {
      // A VFREEBUSY's own DTSTART/DTEND must be concrete instants; this
      // server doesn't synthesize an open-ended one.
      return { status: 400, body: '' };
    }
    const { start: rangeStart, end: rangeEnd } = timeRange;

    let floatingTimeZone: string | null;
    try {
      floatingTimeZone = resolveReportFloatingTimeZone(null, calendar);
    } catch (error) {
      if (!(error instanceof CalendarParseError)) {
        throw error;
      }
      floatingTimeZone = null;
    }

    const intervals = await collectCalendarBusyIntervals(
      context.manager,
      context.principal,
      calendar,
      rangeStart,
      rangeEnd,
      floatingTimeZone,
    );

    return {
      status: 200,
      body: buildFreeBusyBody(rangeStart, rangeEnd, coalesce(intervals)),
      contentType: 'text/calendar',
    };
  }
}

/**
 * Every busy interval `requestingPrincipal` may see in `calendar` within
 * `[rangeStart, rangeEnd)`: the same Phase-1 database prefilter and
 * Phase-2 `expandOccurrences`/`busyIntervalsOf` `calendar-query` and
 * `free-busy-query` (this file) both use, with the same per-object
 * `read-free-busy` ACL check (`selectCalendarObjectsWithPrivilege`) — a
 * denied object contributes nothing, silently, rather than failing the
 * whole calculation.
 *
 * Extracted as its own function (not just `FreeBusyQueryReportHandler`'s
 * private method) so the scheduling Outbox's `freebusy-request` handler
 * (RFC 6638 §5, M7) can reuse it per calendar while aggregating busy
 * time across *all* of an attendee's calendars, not just the one a
 * `free-busy-query` REPORT targets.
 */
export async function collectCalendarBusyIntervals(
  manager: EntityManager,
  requestingPrincipal: Principal,
  calendar: CalendarCollection,
  rangeStart: Date,
  rangeEnd: Date,
  floatingTimeZone: string | null,
): Promise<BusyInterval[]> {
  const query = manager
    .getRepository(CalendarObject)
    .createQueryBuilder('co')
    .where('co.calendarId = :calendarId', { calendarId: calendar.id })
    .andWhere('co.dtstart < :rangeEnd', {
      rangeEnd: rangeEnd.getTime() + FLOATING_TIME_OFFSET_BOUNDS_MS.latest,
    })
    .andWhere(
      '(co.recurrenceSpanEnd IS NULL OR co.recurrenceSpanEnd >= :rangeStart)',
      {
        rangeStart:
          rangeStart.getTime() + FLOATING_TIME_OFFSET_BOUNDS_MS.earliest,
      },
    )
    .orderBy('co.id', 'ASC');

  const intervals: BusyInterval[] = [];
  let offset = 0;
  for (;;) {
    const page = await query.clone().offset(offset).limit(PAGE_SIZE).getMany();
    offset += page.length;
    if (page.length === 0) {
      break;
    }

    const contents = await manager
      .getRepository(CalendarObjectContent)
      .findBy({ calendarObjectId: In(page.map((object) => object.id)) });
    const icsByObjectId = new Map(
      contents.map((content) => [content.calendarObjectId, content.icsData]),
    );
    const readable = await selectCalendarObjectsWithPrivilege(
      manager,
      requestingPrincipal,
      calendar,
      page,
      'read-free-busy',
    );

    for (const object of page) {
      if (!readable.has(object.id)) {
        continue;
      }
      const ics = icsByObjectId.get(object.id);
      if (ics === undefined) {
        continue;
      }
      let parsed: ParsedCalendarObject;
      try {
        parsed = parseCalendarObject(ics);
      } catch {
        continue;
      }
      intervals.push(
        ...busyIntervalsOf(parsed, rangeStart, rangeEnd, floatingTimeZone),
      );
    }

    if (page.length < PAGE_SIZE) {
      break;
    }
  }
  return intervals;
}
