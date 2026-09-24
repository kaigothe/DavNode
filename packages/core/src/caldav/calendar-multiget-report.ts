import {
  hasCalendarPrivilege,
  selectCalendarObjectsWithPrivilege,
} from '../acl/evaluate-privilege.js';
import type {
  ReportContext,
  ReportHandler,
  ReportResult,
} from '../webdav/report-registry.js';
import {
  buildMultistatusResponse,
  type MultistatusResourceResult,
} from '../webdav/xml/multistatus-builder.js';
import {
  buildCalendarObjectResponses,
  calendarObjectNameOf,
  checkSupportedCalendarData,
  findCalendarObjectsByName,
  resolveReportCalendar,
  toCalendarUrl,
} from './calendar-report-support.js';
import { resolveReportFloatingTimeZone } from './calendar-query-timezone.js';
import {
  parseCalendarMultigetRequestBody,
  type CalendarMultigetRequestBody,
} from './calendar-multiget-request.js';

/**
 * Handles the `{CALDAV:}calendar-multiget` REPORT (RFC 4791 §7.9): the
 * client names calendar objects by `<D:href>` — the usual second step
 * after `sync-collection` reported which ones changed — and gets one
 * `<D:response>` per href, in request order. Structurally
 * `addressbook-multiget`'s (M5) CalDAV counterpart.
 *
 * **Target**: the Request-URI must be a calendar
 * (`/dav/{tenant}/calendars/{userId}/{calendarName}`); anything else is
 * `404`. RFC 4791 §7.9 also allows the report directly on a calendar
 * object resource (with exactly one matching href), but nothing reads
 * that way, so it isn't supported.
 *
 * **Authorization**: `read` on the calendar gates the whole request
 * (`403`, empty body) — without it, per-href `404`/`403` answers would
 * reveal which names exist to a caller with no access at all. On top of
 * that every object needs `read` on itself (a calendar object's own ACEs
 * can deny what the calendar grants); a denied object's response is
 * `403` (RFC 4791 §7.9: "the appropriate error status code in the
 * DAV:status element").
 *
 * **Hrefs** — absolute paths or absolute URLs, percent-decoded per
 * segment — resolve only when they name an object exactly one segment
 * below *this* calendar. Everything else (another calendar or user, a
 * deeper path, the calendar itself, an unparsable href) and every
 * non-existent object is a bare `404` response echoing the href as sent.
 * Duplicate hrefs are answered once. A `200` response carries the
 * object's canonical href.
 *
 * **`Depth`**: ignored, per RFC 4791 §7.9 ("the 'Depth' header MUST be
 * ignored by the server").
 *
 * The properties per object follow `buildCalendarObjectResponses`
 * (`getetag` etc. plus `CALDAV:calendar-data`, with its own `<C:expand>`
 * support); a body with no `<D:href>` is `400`.
 */
export class CalendarMultigetReportHandler implements ReportHandler {
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

    let request: CalendarMultigetRequestBody;
    try {
      request = parseCalendarMultigetRequestBody(requestXml);
    } catch {
      return { status: 400, body: '' };
    }
    const unsupported = checkSupportedCalendarData(request.selection);
    if (unsupported) {
      return unsupported;
    }

    const calendarSegments = toCalendarUrl(calendar, context.tenant)
      .split('/')
      .slice(1)
      .map(decodeURIComponent);
    const requested = request.hrefs.map((href) => ({
      href,
      name: calendarObjectNameOf(href, calendarSegments),
    }));

    const names = [
      ...new Set(
        requested.flatMap(({ name }) => (name === null ? [] : [name])),
      ),
    ];
    const objects = await findCalendarObjectsByName(
      context.manager,
      calendar.id,
      names,
    );
    const readable = await selectCalendarObjectsWithPrivilege(
      context.manager,
      context.principal,
      calendar,
      objects,
      'read',
    );
    const readableObjects = objects.filter((object) => readable.has(object.id));

    const wantsExpand =
      request.selection.kind === 'prop' &&
      request.selection.calendarData?.expand !== undefined;
    const floatingTimeZone = wantsExpand
      ? resolveReportFloatingTimeZone(null, calendar)
      : null;

    const rendered = await buildCalendarObjectResponses(
      context,
      calendar,
      readableObjects,
      request.selection,
      floatingTimeZone,
    );
    const renderedByName = new Map(
      readableObjects.map((object, index) => [object.name, rendered[index]]),
    );
    const existingNames = new Set(objects.map((object) => object.name));

    const seen = new Set<string>();
    const responses: MultistatusResourceResult[] = [];
    for (const { href, name } of requested) {
      const key = name === null ? `href:${href}` : `name:${name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      if (name === null || !existingNames.has(name)) {
        responses.push({ href, properties: [], status: 404 });
        continue;
      }
      const response = renderedByName.get(name);
      responses.push(response ?? { href, properties: [], status: 403 });
    }

    return { status: 207, body: buildMultistatusResponse(responses) };
  }
}
