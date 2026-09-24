import type { DataSource } from 'typeorm';
import { create } from 'xmlbuilder2';
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
import { toCalendarUrl } from './calendar-home-url.js';
import { indexCalendarObject } from './index-calendar-object.js';
import { parseCalendarObject } from './icalendar-parser.js';
import { CalendarQueryReportHandler } from './calendar-query-report.js';

const PASSWORD = 'correct horse battery staple';
const CALDAV = 'urn:ietf:params:xml:ns:caldav';

/** A single-event calendar object (CRLF line endings), one hour long unless `end` is given. */
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

interface ParsedResponse {
  href: string;
  status: string | undefined;
  errors: string[];
  propstats: Array<{
    status: string;
    props: Array<{ ns: string | null; name: string; value: string }>;
  }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- test-only DOM walking over xmlbuilder2's untyped node tree. */
function kids(node: any): any[] {
  return Array.from(node.childNodes as ArrayLike<any>).filter(
    (child: any) => child.nodeType === 1,
  );
}

/** Parses a multistatus body with a real XML parser, so namespaces and structure are what a client sees. */
function parseMultistatus(xml: string): ParsedResponse[] {
  const root: any = create(xml).root().node;
  expect(root.localName).toBe('multistatus');
  expect(root.namespaceURI).toBe('DAV:');
  return kids(root)
    .filter((child) => child.localName === 'response')
    .map((response) => {
      const parts = kids(response);
      const error = parts.find((part) => part.localName === 'error');
      return {
        href: parts.find((part) => part.localName === 'href').textContent,
        status: parts.find((part) => part.localName === 'status')?.textContent,
        errors: error
          ? kids(error).map((part) => `${part.namespaceURI}${part.localName}`)
          : [],
        propstats: parts
          .filter((part) => part.localName === 'propstat')
          .map((propstat) => {
            const inner = kids(propstat);
            const prop = inner.find((part) => part.localName === 'prop');
            return {
              status: inner.find((part) => part.localName === 'status')
                .textContent,
              props: kids(prop).map((property) => ({
                ns: property.namespaceURI,
                name: property.localName,
                value: property.textContent,
              })),
            };
          }),
      };
    });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function requestBody(
  filter: string,
  props = '<D:getetag/><C:calendar-data/>',
  timezone = '',
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="${CALDAV}">
  <D:prop>${props}</D:prop>
  <C:filter><C:comp-filter name="VCALENDAR">${filter}</C:comp-filter></C:filter>
  ${timezone}
</C:calendar-query>`;
}

const EVENT_FILTER = '<C:comp-filter name="VEVENT">';

describe('CalendarQueryReportHandler', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let stranger: Principal;
  let calendar: CalendarCollection;

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

  const href = (name: string) => `${toCalendarUrl(calendar, tenant)}/${name}`;

  async function addEvent(
    name: string,
    ics: string,
    owner = alice,
  ): Promise<CalendarObject> {
    // Uses the real GA2 index computation, exactly as the PUT route would.
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

  it('a time-range filter finds a one-off event within the range', async () => {
    await addEvent('a.ics', event('uid-a', { summary: 'Standup' }));
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        `${EVENT_FILTER}<C:time-range start="20260924T000000Z" end="20260925T000000Z"/></C:comp-filter>`,
      ),
      context(),
    );

    expect(result.status).toBe(207);
    const responses = parseMultistatus(result.body);
    expect(responses).toHaveLength(1);
    expect(responses[0]?.href).toBe(href('a.ics'));
  });

  it('finds a recurring event whose NEXT instance is in range, even though DTSTART is far earlier', async () => {
    const series = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:series-1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260101T090000Z',
      'DTEND:20260101T100000Z',
      'RRULE:FREQ=WEEKLY;COUNT=20',
      'SUMMARY:Standup',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    await addEvent('series.ics', series);
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        `${EVENT_FILTER}<C:time-range start="20260301T000000Z" end="20260308T000000Z"/></C:comp-filter>`,
      ),
      context(),
    );

    expect(parseMultistatus(result.body)).toHaveLength(1);
  });

  it('does not find a recurring event whose span overlaps the range but has no actual instance in it (Phase 2)', async () => {
    const series = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:series-1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260101T090000Z', // a Thursday
      'DTEND:20260101T100000Z',
      'RRULE:FREQ=WEEKLY;COUNT=20',
      'SUMMARY:Standup',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    await addEvent('series.ics', series);
    const handler = new CalendarQueryReportHandler();

    // Saturday/Sunday: no Thursday instance, though well inside the series' overall span.
    const result = await handler.handle(
      requestBody(
        `${EVENT_FILTER}<C:time-range start="20260307T000000Z" end="20260309T000000Z"/></C:comp-filter>`,
      ),
      context(),
    );

    expect(parseMultistatus(result.body)).toHaveLength(0);
  });

  it('an EXDATE-excluded occurrence in the requested range is not a match', async () => {
    const series = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:series-1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260101T090000Z',
      'DTEND:20260101T100000Z',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'EXDATE:20260108T090000Z',
      'SUMMARY:Standup',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    await addEvent('series.ics', series);
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        `${EVENT_FILTER}<C:time-range start="20260108T000000Z" end="20260109T000000Z"/></C:comp-filter>`,
      ),
      context(),
    );

    expect(parseMultistatus(result.body)).toHaveLength(0);
  });

  it('a prop-filter on SUMMARY with a substring match finds the matching event', async () => {
    await addEvent('a.ics', event('uid-a', { summary: 'Team Standup' }));
    await addEvent('b.ics', event('uid-b', { summary: 'Retro' }));
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        `${EVENT_FILTER}<C:prop-filter name="SUMMARY"><C:text-match>Standup</C:text-match></C:prop-filter></C:comp-filter>`,
      ),
      context(),
    );

    const responses = parseMultistatus(result.body);
    expect(responses).toHaveLength(1);
    expect(responses[0]?.href).toBe(href('a.ics'));
  });

  it('combines a time-range and a prop-filter (both must match)', async () => {
    await addEvent('a.ics', event('uid-a', { summary: 'Team Standup' }));
    await addEvent('b.ics', event('uid-b', { summary: 'Team Retro' }));
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        `${EVENT_FILTER}<C:time-range start="20260924T000000Z" end="20260925T000000Z"/><C:prop-filter name="SUMMARY"><C:text-match>Standup</C:text-match></C:prop-filter></C:comp-filter>`,
      ),
      context(),
    );

    expect(parseMultistatus(result.body).map((r) => r.href)).toEqual([
      href('a.ics'),
    ]);
  });

  it('an empty filter (no time-range, no prop-filter) matches every event', async () => {
    await addEvent('a.ics', event('uid-a'));
    await addEvent('b.ics', event('uid-b'));
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(EVENT_FILTER + '</C:comp-filter>'),
      context(),
    );

    expect(parseMultistatus(result.body)).toHaveLength(2);
  });

  it('a comp-filter for a type this server never stores (e.g. VTODO) matches nothing, without a 403', async () => {
    await addEvent('a.ics', event('uid-a'));
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody('<C:comp-filter name="VTODO"/>'),
      context(),
    );

    expect(result.status).toBe(207);
    expect(parseMultistatus(result.body)).toHaveLength(0);
  });

  it('rejects an unsupported prop-filter with 403 supported-filter, naming it', async () => {
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        `${EVENT_FILTER}<C:prop-filter name="LOCATION"><C:text-match>Room</C:text-match></C:prop-filter></C:comp-filter>`,
      ),
      context(),
    );

    expect(result.status).toBe(403);
    expect(result.body).toContain('supported-filter');
    expect(result.body).toContain('LOCATION');
  });

  it('rejects an unsupported collation with 403 supported-collation', async () => {
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        `${EVENT_FILTER}<C:prop-filter name="SUMMARY"><C:text-match collation="i;unicode-casemap">x</C:text-match></C:prop-filter></C:comp-filter>`,
      ),
      context(),
    );

    expect(result.status).toBe(403);
    expect(result.body).toContain('supported-collation');
  });

  it('is gated by read on the calendar (403), and per-object ACL filters matches (not counted, not errored)', async () => {
    await addEvent('a.ics', event('uid-a'));
    const handler = new CalendarQueryReportHandler();

    const denied = await handler.handle(
      requestBody(EVENT_FILTER + '</C:comp-filter>'),
      context({ principal: stranger }),
    );
    expect(denied.status).toBe(403);

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
        privilege: 'read',
        grantDeny: 'deny',
        position: 0,
      }),
    );

    const allowed = await handler.handle(
      requestBody(EVENT_FILTER + '</C:comp-filter>'),
      context({ principal: stranger }),
    );
    expect(allowed.status).toBe(207);
    expect(parseMultistatus(allowed.body).map((r) => r.href)).toEqual([
      href('a.ics'),
    ]);
  });

  it('read-free-busy alone does not let a stranger query the calendar', async () => {
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
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(EVENT_FILTER + '</C:comp-filter>'),
      context({ principal: stranger }),
    );

    expect(result.status).toBe(403);
  });

  it('a nonexistent calendar or the home as the Request-URI is 404', async () => {
    const handler = new CalendarQueryReportHandler();

    for (const segments of [
      ['calendars', alice.id, 'nope'],
      ['calendars', alice.id],
    ]) {
      const result = await handler.handle(
        requestBody(EVENT_FILTER + '</C:comp-filter>'),
        context({ segments }),
      );
      expect(result.status).toBe(404);
    }
  });

  it('an invalid Depth value is 400; a missing Depth, 0, 1 and infinity all search the calendar', async () => {
    await addEvent('a.ics', event('uid-a'));
    const handler = new CalendarQueryReportHandler();

    for (const depth of [undefined, '0', '1', 'infinity']) {
      const result = await handler.handle(
        requestBody(EVENT_FILTER + '</C:comp-filter>'),
        context({ depth }),
      );
      expect(parseMultistatus(result.body)).toHaveLength(1);
    }
    const bad = await handler.handle(
      requestBody(EVENT_FILTER + '</C:comp-filter>'),
      context({ depth: '2' }),
    );
    expect(bad.status).toBe(400);
  });

  it('rejects an unsupported calendar-data content-type/version with 403', async () => {
    await addEvent('a.ics', event('uid-a'));
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        EVENT_FILTER + '</C:comp-filter>',
        '<C:calendar-data version="1.0"/>',
      ),
      context(),
    );

    expect(result.status).toBe(403);
    expect(result.body).toContain('supported-calendar-data');
  });

  it('rejects a malformed <C:timezone> with 403 valid-calendar-data', async () => {
    await addEvent('a.ics', event('uid-a'));
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        EVENT_FILTER + '</C:comp-filter>',
        undefined,
        '<C:timezone>not a VTIMEZONE</C:timezone>',
      ),
      context(),
    );

    expect(result.status).toBe(403);
    expect(result.body).toContain('valid-calendar-data');
  });

  it('a malformed request body is 400', async () => {
    const handler = new CalendarQueryReportHandler();

    expect((await handler.handle('<C:calendar-query', context())).status).toBe(
      400,
    );
  });

  it('truncates at the configured cap with a leading 507 number-of-matches-within-limits response', async () => {
    for (let index = 0; index < 5; index += 1) {
      await addEvent(`e${index}.ics`, event(`uid-${index}`));
    }
    const handler = new CalendarQueryReportHandler(3);

    const result = await handler.handle(
      requestBody(EVENT_FILTER + '</C:comp-filter>'),
      context(),
    );

    expect(result.status).toBe(207);
    const responses = parseMultistatus(result.body);
    expect(responses[0]?.status).toContain('507');
    expect(responses[0]?.errors).toContain(
      'DAV:number-of-matches-within-limits',
    );
    expect(responses).toHaveLength(4); // the 507 marker + 3 real matches
  });

  it('expands a recurring event when <C:calendar-data><C:expand> is requested', async () => {
    const series = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:series-1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260105T090000Z',
      'DTEND:20260105T100000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'SUMMARY:Standup',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    await addEvent('series.ics', series);
    const handler = new CalendarQueryReportHandler();

    const result = await handler.handle(
      requestBody(
        `${EVENT_FILTER}<C:time-range start="20260101T000000Z" end="20260201T000000Z"/></C:comp-filter>`,
        '<C:calendar-data><C:expand start="20260101T000000Z" end="20260201T000000Z"/></C:calendar-data>',
      ),
      context(),
    );

    const responses = parseMultistatus(result.body);
    expect(responses).toHaveLength(1); // one response per RESOURCE, not per instance
    const data =
      responses[0]?.propstats[0]?.props.find((p) => p.name === 'calendar-data')
        ?.value ?? '';
    expect((data.match(/BEGIN:VEVENT/g) ?? []).length).toBe(4);
  });
});
