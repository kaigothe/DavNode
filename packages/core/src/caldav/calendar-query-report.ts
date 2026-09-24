import { In } from 'typeorm';
import {
  hasCalendarPrivilege,
  selectCalendarObjectsWithPrivilege,
} from '../acl/evaluate-privilege.js';
import { CalendarObjectContent } from '../entities/calendar-object-content.entity.js';
import { CalendarObject } from '../entities/calendar-object.entity.js';
import type { CalendarCollection } from '../entities/calendar-collection.entity.js';
import type {
  ReportContext,
  ReportHandler,
  ReportResult,
} from '../webdav/report-registry.js';
import {
  buildErrorResponse,
  type ErrorCondition,
} from '../webdav/xml/error-response-builder.js';
import {
  buildMultistatusResponse,
  type MultistatusResourceResult,
} from '../webdav/xml/multistatus-builder.js';
import { CALDAV_NAMESPACE } from './caldav-namespace.js';
import { calendarTextMatches } from './calendar-text-match.js';
import { FLOATING_TIME_OFFSET_BOUNDS_MS } from './index-calendar-object.js';
import {
  expandOccurrences,
  RecurrenceLimitError,
} from './expand-recurrence.js';
import {
  CalendarParseError,
  parseCalendarObject,
  type ParsedCalendarObject,
} from './icalendar-parser.js';
import {
  buildCalendarObjectResponses,
  checkSupportedCalendarData,
  resolveReportCalendar,
  toCalendarUrl,
} from './calendar-report-support.js';
import { resolveReportFloatingTimeZone } from './calendar-query-timezone.js';
import {
  parseCalendarQueryRequestBody,
  type CalendarFilter,
  type CalendarPropFilter,
  type CalendarQueryRequestBody,
  type CalendarTimeRangeFilter,
  type UnsupportedCalendarFilterParts,
} from './calendar-query-request.js';

/**
 * The most calendar objects one `calendar-query` response carries,
 * whatever the range asked for (RFC 4791 §7.8's
 * `number-of-matches-within-limits` postcondition). Bounds the work and
 * the size of a single response; a larger result set is truncated with
 * a `507`, mirroring `addressbook-query`'s own cap (M5).
 */
export const MAX_QUERY_RESULTS = 5000;

/** Most rows one database round trip fetches while collecting matches. */
const PAGE_SIZE = 200;

/** The `403` a filter with unsupported parts is answered with, naming each offending piece. */
function unsupportedFilterResult(
  parts: UnsupportedCalendarFilterParts,
): ReportResult | null {
  const conditions: ErrorCondition[] = [];
  if (parts.names.length > 0 || parts.paramFilters.length > 0) {
    conditions.push({
      namespace: CALDAV_NAMESPACE,
      name: 'supported-filter',
      children: [
        ...parts.names.map((name) => ({
          namespace: CALDAV_NAMESPACE,
          name: 'comp-filter',
          attributes: { name },
        })),
        ...parts.paramFilters.map((name) => ({
          namespace: CALDAV_NAMESPACE,
          name: 'param-filter',
          attributes: { name },
        })),
      ],
    });
  }
  if (parts.collations.length > 0) {
    conditions.push({
      namespace: CALDAV_NAMESPACE,
      name: 'supported-collation',
    });
  }
  return conditions.length === 0
    ? null
    : { status: 403, body: buildErrorResponse(conditions) };
}

/**
 * Whether `parsed`'s master satisfies every `propFilters` condition (RFC
 * 4791 §9.7.2), each checked against `SUMMARY` — the only property
 * `ParsedComponent` extracts, and the only one Große Aufgabe 6 asks a
 * `calendar-query` to filter on. An object with no master (overrides
 * only) has no `SUMMARY` to test, so `isNotDefined` matches and a
 * `text-match` does not.
 */
export function matchesPropFilters(
  parsed: ParsedCalendarObject,
  propFilters: readonly CalendarPropFilter[],
): boolean {
  const summary = parsed.master?.summary ?? null;
  return propFilters.every((propFilter) => {
    if (propFilter.isNotDefined) {
      return summary === null;
    }
    if (summary === null) {
      return false;
    }
    return (
      propFilter.textMatch === null ||
      calendarTextMatches(summary, propFilter.textMatch)
    );
  });
}

/**
 * Whether at least one actual occurrence of `parsed` overlaps
 * `timeRange` (RFC 4791 §7.4/§9.9: Phase 2 — the exact test, unlike the
 * database prefilter's span-level approximation). `null` (no
 * `<C:time-range>` at all) always matches.
 *
 * @throws {@link RecurrenceLimitError} If the object's recurrence set is
 * too large to walk to the end of the range — the caller decides what an
 * unanswerable object means for the query (excluded, see
 * `CalendarQueryReportHandler`).
 */
export function matchesTimeRange(
  parsed: ParsedCalendarObject,
  timeRange: CalendarTimeRangeFilter | null,
  floatingTimeZone: string | null,
): boolean {
  if (timeRange === null) {
    return true;
  }
  return (
    expandOccurrences(parsed, timeRange.start, timeRange.end, {
      floatingTimeZone,
    }).length > 0
  );
}

/**
 * Handles the `{CALDAV:}calendar-query` REPORT (RFC 4791 §7.8): the
 * calendar objects of one calendar matching a `<C:filter>`, answered as
 * a `207 Multi-Status` with the requested properties — the same
 * selection logic as `calendar-multiget` (`buildCalendarObjectResponses`).
 *
 * **Two-phase matching**, per Große Aufgabe 6's own design: a coarse,
 * indexed database prefilter (`dtstart`/`recurrence_span_end`, widened
 * by `FLOATING_TIME_OFFSET_BOUNDS_MS` for floating/DATE uncertainty —
 * see `index-calendar-object.ts`) narrows candidates without parsing
 * anything, then each candidate's stored text is parsed and checked
 * exactly: `matchesTimeRange` (real recurrence expansion — a span-level
 * prefilter hit is not enough, an object's actual instances must
 * overlap) and `matchesPropFilters` (`SUMMARY`, checked on the master
 * only). See `classifyCalendarFilter` for what `<C:comp-filter>`/
 * `<C:prop-filter>` shapes are understood — a `comp-filter` naming any
 * component type other than `VEVENT` (the only one stored) is decided
 * outright rather than rejected, since this server can always tell
 * whether that type exists; a `prop-filter` on anything but `SUMMARY`, a
 * `param-filter`, a property-level `time-range`, or an unsupported
 * collation is refused with `403` `CALDAV:supported-filter`/
 * `CALDAV:supported-collation`.
 *
 * **Scope (`Depth`)**: the request must name a calendar
 * (`/dav/{tenant}/calendars/{userId}/{calendarName}`, else `404`). RFC
 * 4791 §7.8 defaults a missing `Depth` header to `0`; unlike
 * `addressbook-query`, that still searches the calendar's objects (a
 * calendar's only children), since CalDAV defines no meaning for
 * `calendar-query` at `Depth: 0` beyond "search this collection" — there
 * is no separate "the calendar resource itself" result to return. Any
 * value other than `0`/`1`/`infinity` is `400`.
 *
 * **Authorization**: `read` on the calendar gates the request (`403`),
 * and an object the requester can't `read` (its own ACEs can deny what
 * the calendar grants) is simply not a match — filtered before
 * truncation, so hidden objects never use up result slots.
 *
 * **The `<C:timezone>` request element**, if present and valid,
 * resolves floating/DATE values for this query instead of the
 * calendar's own `calendar-timezone` (RFC 4791 §7.3); an invalid one is
 * `403 CALDAV:valid-calendar-data`.
 *
 * **Limits and truncation**: capped at `MAX_QUERY_RESULTS`. If more
 * objects match, the response is still `207` with the first ones —
 * ordered by object name, so truncation is stable — preceded by one
 * response with status `507` and `DAV:number-of-matches-within-limits`
 * for the Request-URI.
 */
export class CalendarQueryReportHandler implements ReportHandler {
  /**
   * @param maxResults - The server-side result cap; defaults to
   * {@link MAX_QUERY_RESULTS}. Configurable so tests can exercise the cap
   * without inserting thousands of objects.
   */
  constructor(private readonly maxResults: number = MAX_QUERY_RESULTS) {}

  /** See {@link ReportHandler.handle}. */
  async handle(
    requestXml: string,
    context: ReportContext,
  ): Promise<ReportResult> {
    const calendar = await resolveReportCalendar(context);
    if (!calendar) {
      return { status: 404, body: '' };
    }
    if (
      !(await hasCalendarPrivilege(
        context.manager,
        context.principal,
        calendar,
        'read',
      ))
    ) {
      return { status: 403, body: '' };
    }

    let request: CalendarQueryRequestBody;
    try {
      request = parseCalendarQueryRequestBody(requestXml);
    } catch {
      return { status: 400, body: '' };
    }

    const depth = context.depth?.trim().toLowerCase() ?? '0';
    if (depth !== '0' && depth !== '1' && depth !== 'infinity') {
      return { status: 400, body: '' };
    }

    const unsupportedCalendarData = checkSupportedCalendarData(
      request.selection,
    );
    if (unsupportedCalendarData) {
      return unsupportedCalendarData;
    }
    const unsupportedFilter = unsupportedFilterResult(request.unsupported);
    if (unsupportedFilter) {
      return unsupportedFilter;
    }

    let floatingTimeZone: string | null;
    try {
      floatingTimeZone = resolveReportFloatingTimeZone(
        request.timezoneText,
        calendar,
      );
    } catch (error) {
      if (error instanceof CalendarParseError) {
        return {
          status: 403,
          body: buildErrorResponse([
            { namespace: CALDAV_NAMESPACE, name: 'valid-calendar-data' },
          ]),
        };
      }
      throw error;
    }

    const matches =
      request.filter.kind === 'match-none'
        ? []
        : await this.findMatches(
            request.filter,
            context,
            calendar,
            floatingTimeZone,
            this.maxResults + 1,
          );

    const truncated = matches.length > this.maxResults;
    const responses: MultistatusResourceResult[] = [];
    if (truncated) {
      responses.push({
        href: toCalendarUrl(calendar, context.tenant),
        properties: [],
        status: 507,
        error: ['number-of-matches-within-limits'],
      });
    }
    const wantsExpand =
      request.selection.kind === 'prop' &&
      request.selection.calendarData?.expand !== undefined;
    responses.push(
      ...(await buildCalendarObjectResponses(
        context,
        calendar,
        matches.slice(0, this.maxResults),
        request.selection,
        wantsExpand ? floatingTimeZone : null,
      )),
    );
    return { status: 207, body: buildMultistatusResponse(responses) };
  }

  /**
   * The first `count` calendar objects, ordered by name, that match
   * `filter` *and* the requester may read.
   *
   * Phase 1 (the database prefilter) only applies when the filter
   * actually has a `VEVENT`-level `<C:time-range>`; a filter with none
   * (`match-all`, or a `prop-filter`-only `vevent` filter) pages through
   * every object of the calendar instead — there is no indexed shortcut
   * for a `SUMMARY` condition (Große Aufgabe 6's own scope, see the
   * class doc comment).
   *
   * Every Phase-1 candidate is parsed and checked exactly
   * (`matchesTimeRange`/`matchesPropFilters`) before its ACL is
   * evaluated, so access checks are never wasted on a non-match; an
   * object whose own recurrence set is too large to walk
   * (`RecurrenceLimitError`) is excluded rather than failing the whole
   * query — a pathological rule, not something a real query should ever
   * hit for an object this server itself accepted at `PUT`.
   */
  private async findMatches(
    filter: CalendarFilter,
    context: ReportContext,
    calendar: CalendarCollection,
    floatingTimeZone: string | null,
    count: number,
  ): Promise<CalendarObject[]> {
    const timeRange = filter.kind === 'vevent' ? filter.timeRange : null;
    const propFilters = filter.kind === 'vevent' ? filter.propFilters : [];

    const query = context.manager
      .getRepository(CalendarObject)
      .createQueryBuilder('co')
      .where('co.calendarId = :calendarId', { calendarId: calendar.id });
    if (timeRange?.end) {
      query.andWhere('co.dtstart < :rangeEnd', {
        rangeEnd:
          timeRange.end.getTime() + FLOATING_TIME_OFFSET_BOUNDS_MS.latest,
      });
    }
    if (timeRange?.start) {
      query.andWhere(
        '(co.recurrenceSpanEnd IS NULL OR co.recurrenceSpanEnd >= :rangeStart)',
        {
          rangeStart:
            timeRange.start.getTime() + FLOATING_TIME_OFFSET_BOUNDS_MS.earliest,
        },
      );
    }
    query.orderBy('co.name', 'ASC').addOrderBy('co.id', 'ASC');

    const matches: CalendarObject[] = [];
    let offset = 0;
    for (;;) {
      const page = await query
        .clone()
        .offset(offset)
        .limit(PAGE_SIZE)
        .getMany();
      offset += page.length;
      if (page.length === 0) {
        break;
      }

      const candidates = await this.filterByContent(
        page,
        context,
        timeRange,
        propFilters,
        floatingTimeZone,
      );
      if (candidates.length > 0) {
        const allowed = await selectCalendarObjectsWithPrivilege(
          context.manager,
          context.principal,
          calendar,
          candidates,
          'read',
        );
        for (const candidate of candidates) {
          if (allowed.has(candidate.id)) {
            matches.push(candidate);
            if (matches.length >= count) {
              return matches;
            }
          }
        }
      }

      if (page.length < PAGE_SIZE) {
        break;
      }
    }
    return matches;
  }

  /** Parses each of `objects`' stored text and keeps the ones that pass Phase 2 (`matchesTimeRange`/`matchesPropFilters`). */
  private async filterByContent(
    objects: readonly CalendarObject[],
    context: ReportContext,
    timeRange: CalendarTimeRangeFilter | null,
    propFilters: readonly CalendarPropFilter[],
    floatingTimeZone: string | null,
  ): Promise<CalendarObject[]> {
    const contents = await context.manager
      .getRepository(CalendarObjectContent)
      .findBy({
        calendarObjectId: In(objects.map((object) => object.id)),
      });
    const icsByObjectId = new Map(
      contents.map((content) => [content.calendarObjectId, content.icsData]),
    );

    const matched: CalendarObject[] = [];
    for (const object of objects) {
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
      try {
        if (
          matchesTimeRange(parsed, timeRange, floatingTimeZone) &&
          matchesPropFilters(parsed, propFilters)
        ) {
          matched.push(object);
        }
      } catch (error) {
        if (error instanceof RecurrenceLimitError) {
          continue;
        }
        throw error;
      }
    }
    return matched;
  }
}
