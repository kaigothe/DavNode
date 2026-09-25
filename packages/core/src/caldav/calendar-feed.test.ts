import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { saveCalendarObject } from './calendar-object-writes.js';
import { buildCalendarFeed, loadCalendarFeedIcsData } from './calendar-feed.js';
import { parseCalendarObject } from './icalendar-parser.js';

/** A single-event calendar object, CRLF line endings like a real client sends. */
function event(uid: string, summary = 'Meeting'): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260924T100000Z',
    `SUMMARY:${summary}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** A single-event calendar object using a custom (non-IANA) time zone, `tzid`. */
function eventWithZone(uid: string, tzid: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VTIMEZONE',
    `TZID:${tzid}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0100',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    `DTSTART;TZID=${tzid}:20260924T100000`,
    'SUMMARY:Zoned',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** A recurring series whose second instance is moved by a `RECURRENCE-ID` override — one CalendarObject, two VEVENTs. */
const SERIES = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//DavNode//Test//EN',
  'BEGIN:VEVENT',
  'UID:series-1',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260105T090000Z',
  'DTEND:20260105T100000Z',
  'RRULE:FREQ=WEEKLY;COUNT=4',
  'SUMMARY:Standup',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:series-1',
  'DTSTAMP:20260101T000000Z',
  'RECURRENCE-ID:20260112T090000Z',
  'DTSTART:20260112T140000Z',
  'DTEND:20260112T150000Z',
  'SUMMARY:Standup (moved)',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

describe('buildCalendarFeed', () => {
  it('produces a valid, empty VCALENDAR for no objects', () => {
    const feed = buildCalendarFeed([]);

    expect(feed).toContain('BEGIN:VCALENDAR');
    expect(feed).toContain('VERSION:2.0');
    expect(feed).toContain('END:VCALENDAR');
    expect(feed).not.toContain('BEGIN:VEVENT');
  });

  it('merges every VEVENT from every object into one VCALENDAR', () => {
    const feed = buildCalendarFeed([
      event('uid-1', 'One'),
      event('uid-2', 'Two'),
    ]);

    expect((feed.match(/BEGIN:VCALENDAR/g) ?? []).length).toBe(1);
    expect((feed.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(feed).toContain('UID:uid-1');
    expect(feed).toContain('UID:uid-2');
  });

  it('carries both the master and its RECURRENCE-ID override from one object', () => {
    const feed = buildCalendarFeed([SERIES]);

    expect((feed.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(feed).toContain('RRULE:FREQ=WEEKLY;COUNT=4');
    expect(feed).toContain('RECURRENCE-ID:20260112T090000Z');
    expect(feed).toContain('Standup (moved)');
  });

  it("includes each object's VTIMEZONE, ahead of the VEVENTs", () => {
    const feed = buildCalendarFeed([
      eventWithZone('uid-1', 'Europe/Berlin-ish'),
    ]);

    const tzIndex = feed.indexOf('BEGIN:VTIMEZONE');
    const eventIndex = feed.indexOf('BEGIN:VEVENT');
    expect(tzIndex).toBeGreaterThan(-1);
    expect(tzIndex).toBeLessThan(eventIndex);
    expect(feed).toContain('TZID:Europe/Berlin-ish');
  });

  it('deduplicates a VTIMEZONE shared by more than one object', () => {
    const feed = buildCalendarFeed([
      eventWithZone('uid-1', 'Custom/Zone'),
      eventWithZone('uid-2', 'Custom/Zone'),
    ]);

    expect((feed.match(/BEGIN:VTIMEZONE/g) ?? []).length).toBe(1);
    expect((feed.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
  });

  it('keeps distinct VTIMEZONEs for distinct TZIDs', () => {
    const feed = buildCalendarFeed([
      eventWithZone('uid-1', 'Zone/A'),
      eventWithZone('uid-2', 'Zone/B'),
    ]);

    expect((feed.match(/BEGIN:VTIMEZONE/g) ?? []).length).toBe(2);
  });
});

describe('loadCalendarFeedIcsData', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let owner: Principal;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    owner = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function newCalendar(name: string) {
    return dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        name,
        displayName: name,
      }),
    );
  }

  function put(calendarId: string, name: string, ics: string) {
    return saveCalendarObject(dataSource, {
      tenantId: tenant.id,
      calendarId,
      name,
      ownerPrincipalId: owner.id,
      ics,
      parsed: parseCalendarObject(ics),
      etag: 'etag-' + name,
      existing: null,
    });
  }

  it('loads the content of every object in the calendar, and none from another', async () => {
    const work = await newCalendar('work');
    const other = await newCalendar('other');
    await put(work.id, 'a.ics', event('uid-a'));
    await put(work.id, 'b.ics', event('uid-b'));
    await put(other.id, 'c.ics', event('uid-c'));

    const loaded = await loadCalendarFeedIcsData(dataSource.manager, work.id);

    expect(loaded).toHaveLength(2);
    expect(loaded.some((ics) => ics.includes('UID:uid-a'))).toBe(true);
    expect(loaded.some((ics) => ics.includes('UID:uid-b'))).toBe(true);
    expect(loaded.some((ics) => ics.includes('UID:uid-c'))).toBe(false);
  });

  it('returns an empty list for a calendar with no objects', async () => {
    const empty = await newCalendar('empty');

    const loaded = await loadCalendarFeedIcsData(dataSource.manager, empty.id);

    expect(loaded).toEqual([]);
  });
});
