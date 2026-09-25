import ICAL from 'ical.js';
import { In, type EntityManager } from 'typeorm';
import { CalendarObjectContent } from '../entities/calendar-object-content.entity.js';
import { CalendarObject } from '../entities/calendar-object.entity.js';

/** Most rows one query fetches at a time while loading every content row of a (potentially large) calendar. */
const CONTENT_LOOKUP_CHUNK_SIZE = 500;

/**
 * The raw iCalendar text of every `CalendarObject` in `calendarId`, in no
 * particular order — {@link buildCalendarFeed} merges them into one
 * document for the ICS feed (`ics-feed.route.ts`). Loaded in chunks of
 * {@link CONTENT_LOOKUP_CHUNK_SIZE} like `calendar-report-support.ts`'s
 * `loadIcsData`, so a large calendar doesn't build one unbounded `IN`
 * clause.
 */
export async function loadCalendarFeedIcsData(
  manager: EntityManager,
  calendarId: string,
): Promise<string[]> {
  const objects = await manager
    .getRepository(CalendarObject)
    .find({ where: { calendarId }, select: { id: true } });

  const icsData: string[] = [];
  for (
    let start = 0;
    start < objects.length;
    start += CONTENT_LOOKUP_CHUNK_SIZE
  ) {
    const chunk = objects.slice(start, start + CONTENT_LOOKUP_CHUNK_SIZE);
    const rows = await manager.getRepository(CalendarObjectContent).findBy({
      calendarObjectId: In(chunk.map((object) => object.id)),
    });
    icsData.push(...rows.map((row) => row.icsData));
  }
  return icsData;
}

/**
 * Merges every calendar object's raw iCalendar text in `icsDataList` into
 * one `VCALENDAR` document — the read-only ICS feed
 * (planning/01-decisions.md, Runde 14/21): every `VEVENT` (a master and
 * its `RECURRENCE-ID` overrides both count) from every object, carried
 * over unchanged (no recurrence expansion — unlike `<C:expand>`, a feed
 * subscriber's own client resolves the `RRULE`).
 *
 * Each object's `VTIMEZONE` definitions are merged in too, ahead of every
 * `VEVENT` (so a subscriber's parser sees a `TZID` defined before it's
 * referenced), deduplicated by `TZID` — more than one object may use the
 * same custom time zone, and repeating its definition is needless bulk,
 * not a correctness problem, but is avoided anyway for a cleaner feed.
 *
 * @param icsDataList - Every object's stored iCalendar text (order
 * doesn't matter, see {@link loadCalendarFeedIcsData}). Empty produces a
 * valid, empty `VCALENDAR`.
 */
export function buildCalendarFeed(icsDataList: readonly string[]): string {
  const output = new ICAL.Component(['vcalendar', [], []]);
  output.updatePropertyWithValue('version', '2.0');
  output.updatePropertyWithValue('prodid', '-//DavNode//ICS Feed//EN');

  const roots = icsDataList.map((ics) => {
    const jcal = ICAL.parse(ics) as unknown;
    return new ICAL.Component(
      jcal as ConstructorParameters<typeof ICAL.Component>[0],
    );
  });

  const seenTzids = new Set<string>();
  for (const root of roots) {
    for (const timezone of root.getAllSubcomponents('vtimezone')) {
      const tzid = timezone.getFirstPropertyValue('tzid') as string | null;
      if (tzid !== null) {
        if (seenTzids.has(tzid)) {
          continue;
        }
        seenTzids.add(tzid);
      }
      output.addSubcomponent(timezone);
    }
  }
  for (const root of roots) {
    for (const vevent of root.getAllSubcomponents('vevent')) {
      output.addSubcomponent(vevent);
    }
  }

  return output.toString();
}
