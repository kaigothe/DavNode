import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarAce,
  CalendarCollection,
  CalendarObject,
  CalendarObjectAce,
  CalendarObjectContent,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import type { ReportContext } from '../webdav/report-registry.js';
import { indexCalendarObject } from './index-calendar-object.js';
import { parseCalendarObject } from './icalendar-parser.js';
import { FreeBusyQueryReportHandler } from './free-busy-query-report.js';

const PASSWORD = 'correct horse battery staple';
const CALDAV = 'urn:ietf:params:xml:ns:caldav';

/** A single-event calendar object (CRLF line endings). */
function event(
  uid: string,
  options: {
    start?: string;
    end?: string;
    summary?: string;
    extra?: string[];
  } = {},
): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    `DTSTART:${options.start ?? '20260924T100000Z'}`,
    `DTEND:${options.end ?? '20260924T110000Z'}`,
    `SUMMARY:${options.summary ?? 'Meeting'}`,
    ...(options.extra ?? []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function requestBody(start: string, end: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<C:free-busy-query xmlns:C="${CALDAV}"><C:time-range start="${start}" end="${end}"/></C:free-busy-query>`;
}

/** Every `FREEBUSY` line of a `VFREEBUSY` body: `[fbtype, start, end]`. */
function freebusyLines(
  body: string,
): Array<{ fbtype: string; start: string; end: string }> {
  const lines: Array<{ fbtype: string; start: string; end: string }> = [];
  for (const line of body.split('\r\n')) {
    const match = /^FREEBUSY(;FBTYPE=([\w-]+))?:(\S+)\/(\S+)$/.exec(line);
    if (match) {
      lines.push({
        fbtype: match[2] ?? 'BUSY',
        start: match[3],
        end: match[4],
      });
    }
  }
  return lines;
}

describe('FreeBusyQueryReportHandler', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let stranger: Principal;
  let calendar: CalendarCollection;
  let handler: FreeBusyQueryReportHandler;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    const users = new UserService(dataSource);
    const aliceUser = await users.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    const bobUser = await users.createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    alice = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: aliceUser.principalId });
    stranger = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: bobUser.principalId });

    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.id,
        name: 'work',
        displayName: 'Work',
      }),
    );
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId: alice.id,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    );

    handler = new FreeBusyQueryReportHandler();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function context(overrides: Partial<ReportContext> = {}): ReportContext {
    return {
      tenant,
      principal: alice,
      manager: dataSource.manager,
      segments: ['calendars', alice.id, 'work'],
      ...overrides,
    };
  }

  async function addEvent(
    name: string,
    ics: string,
    owner = alice,
  ): Promise<CalendarObject> {
    return dataSource.transaction(async (manager) => {
      const parsed = parseCalendarObject(ics);
      const object = await manager.getRepository(CalendarObject).save(
        manager.getRepository(CalendarObject).create({
          tenantId: tenant.id,
          calendarId: calendar.id,
          name,
          uid: name,
          etag: `etag-${name}`,
          componentType: 'VEVENT',
          ownerPrincipalId: owner.id,
          dtstart: new Date(0),
        }),
      );
      await manager.getRepository(CalendarObjectContent).save(
        manager.getRepository(CalendarObjectContent).create({
          calendarObjectId: object.id,
          icsData: ics,
        }),
      );
      await indexCalendarObject(manager, object.id, parsed);
      return object;
    });
  }

  it('is a text/calendar body, not multistatus XML, with the requested range as DTSTART/DTEND', async () => {
    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context(),
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe('text/calendar');
    expect(result.body).toContain('BEGIN:VCALENDAR');
    expect(result.body).toContain('BEGIN:VFREEBUSY');
    expect(result.body).toContain('DTSTART:20260924T000000Z');
    expect(result.body).toContain('DTEND:20260925T000000Z');
    expect(result.body).not.toContain('<D:multistatus');
  });

  it('reports a single opaque event as one busy interval', async () => {
    await addEvent('a.ics', event('uid-a'));

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context(),
    );

    expect(freebusyLines(result.body)).toEqual([
      { fbtype: 'BUSY', start: '20260924T100000Z', end: '20260924T110000Z' },
    ]);
  });

  it('coalesces two overlapping busy events into one interval', async () => {
    await addEvent(
      'a.ics',
      event('uid-a', { start: '20260924T100000Z', end: '20260924T113000Z' }),
    );
    await addEvent(
      'b.ics',
      event('uid-b', { start: '20260924T110000Z', end: '20260924T120000Z' }),
    );

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context(),
    );

    expect(freebusyLines(result.body)).toEqual([
      { fbtype: 'BUSY', start: '20260924T100000Z', end: '20260924T120000Z' },
    ]);
  });

  it('coalesces two adjacent (touching) busy events into one interval', async () => {
    await addEvent(
      'a.ics',
      event('uid-a', { start: '20260924T100000Z', end: '20260924T110000Z' }),
    );
    await addEvent(
      'b.ics',
      event('uid-b', { start: '20260924T110000Z', end: '20260924T120000Z' }),
    );

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context(),
    );

    expect(freebusyLines(result.body)).toEqual([
      { fbtype: 'BUSY', start: '20260924T100000Z', end: '20260924T120000Z' },
    ]);
  });

  it('does not coalesce two separate busy events', async () => {
    await addEvent(
      'a.ics',
      event('uid-a', { start: '20260924T100000Z', end: '20260924T110000Z' }),
    );
    await addEvent(
      'b.ics',
      event('uid-b', { start: '20260924T140000Z', end: '20260924T150000Z' }),
    );

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context(),
    );

    expect(freebusyLines(result.body)).toHaveLength(2);
  });

  it('excludes a TRANSP:TRANSPARENT event entirely', async () => {
    await addEvent('a.ics', event('uid-a', { extra: ['TRANSP:TRANSPARENT'] }));

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context(),
    );

    expect(freebusyLines(result.body)).toEqual([]);
  });

  it('excludes a STATUS:CANCELLED event entirely', async () => {
    await addEvent('a.ics', event('uid-a', { extra: ['STATUS:CANCELLED'] }));

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context(),
    );

    expect(freebusyLines(result.body)).toEqual([]);
  });

  it('reports a STATUS:TENTATIVE event as BUSY-TENTATIVE, separately from BUSY intervals', async () => {
    await addEvent('a.ics', event('uid-a', { extra: ['STATUS:TENTATIVE'] }));
    await addEvent(
      'b.ics',
      event('uid-b', { start: '20260924T140000Z', end: '20260924T150000Z' }),
    );

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context(),
    );

    const lines = freebusyLines(result.body);
    expect(lines.find((l) => l.start === '20260924T100000Z')?.fbtype).toBe(
      'BUSY-TENTATIVE',
    );
    expect(lines.find((l) => l.start === '20260924T140000Z')?.fbtype).toBe(
      'BUSY',
    );
  });

  it('an override cancelling a single instance excludes only that instance', async () => {
    const series = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:series-1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260924T100000Z',
      'DTEND:20260924T110000Z',
      'RRULE:FREQ=DAILY;COUNT=2',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:series-1',
      'DTSTAMP:20260101T000000Z',
      'RECURRENCE-ID:20260925T100000Z',
      'DTSTART:20260925T100000Z',
      'DTEND:20260925T110000Z',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    await addEvent('series.ics', series);

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260926T000000Z'),
      context(),
    );

    expect(freebusyLines(result.body)).toEqual([
      { fbtype: 'BUSY', start: '20260924T100000Z', end: '20260924T110000Z' },
    ]);
  });

  it('returns an empty VFREEBUSY (no FREEBUSY property) when nothing is busy', async () => {
    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context(),
    );

    expect(freebusyLines(result.body)).toEqual([]);
    expect(result.body).toContain('BEGIN:VFREEBUSY');
    expect(result.body).toContain('END:VFREEBUSY');
  });

  it('a user with only CALDAV:read-free-busy gets the free/busy answer but cannot calendar-query', async () => {
    await addEvent('a.ics', event('uid-a'));
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId: stranger.id,
        privilege: 'read-free-busy',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const freeBusy = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context({ principal: stranger }),
    );
    expect(freeBusy.status).toBe(200);
    expect(freebusyLines(freeBusy.body)).toHaveLength(1);

    const { CalendarQueryReportHandler } =
      await import('./calendar-query-report.js');
    const query = await new CalendarQueryReportHandler().handle(
      '<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><D:getetag/></D:prop><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter></C:filter></C:calendar-query>',
      context({ principal: stranger }),
    );
    expect(query.status).toBe(403);
  });

  it('a user without read or read-free-busy gets 404, not 403 (no existence leak)', async () => {
    await addEvent('a.ics', event('uid-a'));

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context({ principal: stranger }),
    );

    expect(result.status).toBe(404);
    expect(result.body).toBe('');
  });

  it('an object-level deny still hides that object from a principal with calendar-level access', async () => {
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId: stranger.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );
    const hidden = await addEvent('hidden.ics', event('uid-hidden'));
    await dataSource.getRepository(CalendarObjectAce).save(
      dataSource.getRepository(CalendarObjectAce).create({
        calendarObjectId: hidden.id,
        principalId: stranger.id,
        privilege: 'read-free-busy',
        grantDeny: 'deny',
        position: 0,
      }),
    );

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context({ principal: stranger }),
    );

    expect(freebusyLines(result.body)).toEqual([]);
  });

  it('a nonexistent calendar and the home are 404', async () => {
    for (const segments of [
      ['calendars', alice.id, 'nope'],
      ['calendars', alice.id],
    ]) {
      const result = await handler.handle(
        requestBody('20260924T000000Z', '20260925T000000Z'),
        context({ segments }),
      );
      expect(result.status).toBe(404);
    }
  });

  it('an object path (a calendar object resource) is 403, per RFC 4791 §7.10', async () => {
    await addEvent('a.ics', event('uid-a'));

    const result = await handler.handle(
      requestBody('20260924T000000Z', '20260925T000000Z'),
      context({ segments: ['calendars', alice.id, 'work', 'a.ics'] }),
    );

    expect(result.status).toBe(403);
  });

  it('a body with no time-range, an open-ended range, or malformed XML is 400', async () => {
    expect(
      (
        await handler.handle(
          `<C:free-busy-query xmlns:C="${CALDAV}"/>`,
          context(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handler.handle(
          `<C:free-busy-query xmlns:C="${CALDAV}"><C:time-range start="20260924T000000Z"/></C:free-busy-query>`,
          context(),
        )
      ).status,
    ).toBe(400);
    expect((await handler.handle('<C:free-busy-query', context())).status).toBe(
      400,
    );
  });
});
