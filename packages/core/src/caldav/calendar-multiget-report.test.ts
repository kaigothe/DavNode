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
import { CalendarMultigetReportHandler } from './calendar-multiget-report.js';
import { parseCalendarMultigetRequestBody } from './calendar-multiget-request.js';

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
  hrefs: string[],
  props = '<D:getetag/><C:calendar-data/>',
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-multiget xmlns:D="DAV:" xmlns:C="${CALDAV}">
  <D:prop>${props}</D:prop>
  ${hrefs.map((href) => `<D:href>${href}</D:href>`).join('')}
</C:calendar-multiget>`;
}

describe('CalendarMultigetReportHandler', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let stranger: Principal;
  let calendar: CalendarCollection;
  let handler: CalendarMultigetReportHandler;

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

    handler = new CalendarMultigetReportHandler();
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
    return dataSource.transaction(async (manager) => {
      const object = await manager.getRepository(CalendarObject).save(
        manager.getRepository(CalendarObject).create({
          tenantId: tenant.id,
          calendarId: calendar.id,
          name,
          uid: name,
          etag: `etag-${name}`,
          componentType: 'VEVENT',
          ownerPrincipalId: owner.id,
          dtstart: new Date('2026-09-24T10:00:00Z'),
        }),
      );
      await manager.getRepository(CalendarObjectContent).save(
        manager.getRepository(CalendarObjectContent).create({
          calendarObjectId: object.id,
          icsData: ics,
        }),
      );
      return object;
    });
  }

  it('returns the requested calendar-data and etag for existing hrefs, in request order', async () => {
    const a = await addEvent('a.ics', event('uid-a', { summary: 'Standup' }));
    await addEvent('b.ics', event('uid-b', { summary: 'Retro' }));

    const result = await handler.handle(
      requestBody([href('b.ics'), href('a.ics')]),
      context(),
    );

    expect(result.status).toBe(207);
    const responses = parseMultistatus(result.body);
    expect(responses.map((r) => r.href)).toEqual([
      href('b.ics'),
      href('a.ics'),
    ]);
    const aResponse = responses.find((r) => r.href === href('a.ics'));
    const props = aResponse?.propstats[0]?.props ?? [];
    expect(props.find((p) => p.name === 'getetag')?.value).toBe(a.etag);
    expect(props.find((p) => p.name === 'calendar-data')?.value).toContain(
      'SUMMARY:Standup',
    );
  });

  it('answers 404 for a deleted/unknown href, and still 200 for the rest', async () => {
    await addEvent('a.ics', event('uid-a'));

    const result = await handler.handle(
      requestBody([href('a.ics'), href('gone.ics')]),
      context(),
    );

    const responses = parseMultistatus(result.body);
    expect(
      responses.find((r) => r.href === href('a.ics'))?.propstats[0]?.status,
    ).toContain('200');
    const gone = responses.find((r) => r.href === href('gone.ics'));
    expect(gone?.status).toContain('404');
    expect(gone?.propstats).toEqual([]);
  });

  it('expands a recurring event when <C:expand> is requested', async () => {
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

    const result = await handler.handle(
      requestBody(
        [href('series.ics')],
        '<C:calendar-data><C:expand start="20260101T000000Z" end="20260201T000000Z"/></C:calendar-data>',
      ),
      context(),
    );

    const responses = parseMultistatus(result.body);
    const data =
      responses[0]?.propstats[0]?.props.find((p) => p.name === 'calendar-data')
        ?.value ?? '';
    expect((data.match(/BEGIN:VEVENT/g) ?? []).length).toBe(4);
    expect(data).not.toContain('RRULE');
  });

  it('resolves hrefs by name only, not by a matching UID', async () => {
    await addEvent('a.ics', event('uid-a'));

    const result = await handler.handle(
      requestBody([href('uid-a')]), // the UID, not the URL name
      context(),
    );

    expect(parseMultistatus(result.body)[0]?.status).toContain('404');
  });

  it('ignores hrefs outside this calendar (another calendar, deeper path, the calendar itself)', async () => {
    await addEvent('a.ics', event('uid-a'));
    const otherCalendar = await dataSource
      .getRepository(CalendarCollection)
      .save(
        dataSource.getRepository(CalendarCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: alice.id,
          name: 'private',
          displayName: 'Private',
        }),
      );

    const result = await handler.handle(
      requestBody([
        `${toCalendarUrl(otherCalendar, tenant)}/a.ics`,
        `${href('a.ics')}/deeper`,
        toCalendarUrl(calendar, tenant),
      ]),
      context(),
    );

    expect(
      parseMultistatus(result.body).every((r) => r.status?.includes('404')),
    ).toBe(true);
  });

  it('answers each duplicate href once', async () => {
    await addEvent('a.ics', event('uid-a'));

    const result = await handler.handle(
      requestBody([href('a.ics'), href('a.ics')]),
      context(),
    );

    expect(parseMultistatus(result.body)).toHaveLength(1);
  });

  it('is gated by read on the calendar as a whole (403, empty body)', async () => {
    await addEvent('a.ics', event('uid-a'));

    const result = await handler.handle(
      requestBody([href('a.ics')]),
      context({ principal: stranger }),
    );

    expect(result.status).toBe(403);
    expect(result.body).toBe('');
  });

  it("an object's own deny wins over a calendar-level grant: 403 for just that response", async () => {
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId: stranger.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );
    const a = await addEvent('a.ics', event('uid-a'));
    await addEvent('b.ics', event('uid-b'));
    await dataSource.getRepository(CalendarObjectAce).save(
      dataSource.getRepository(CalendarObjectAce).create({
        calendarObjectId: a.id,
        principalId: stranger.id,
        privilege: 'read',
        grantDeny: 'deny',
        position: 0,
      }),
    );

    const result = await handler.handle(
      requestBody([href('a.ics'), href('b.ics')]),
      context({ principal: stranger }),
    );

    const responses = parseMultistatus(result.body);
    expect(responses.find((r) => r.href === href('a.ics'))?.status).toContain(
      '403',
    );
    expect(
      responses.find((r) => r.href === href('b.ics'))?.propstats[0]?.status,
    ).toContain('200');
  });

  it('a nonexistent calendar, the home, or an object path as the Request-URI is 404', async () => {
    for (const segments of [
      ['calendars', alice.id, 'nope'],
      ['calendars', alice.id],
      ['calendars', alice.id, 'work', 'a.ics'],
    ]) {
      const result = await handler.handle(
        requestBody(['/x']),
        context({ segments }),
      );
      expect(result.status).toBe(404);
    }
  });

  it('rejects an unsupported calendar-data content-type/version with 403 supported-calendar-data', async () => {
    await addEvent('a.ics', event('uid-a'));

    const result = await handler.handle(
      requestBody(
        [href('a.ics')],
        '<C:calendar-data content-type="application/json"/>',
      ),
      context(),
    );

    expect(result.status).toBe(403);
    expect(result.body).toContain('supported-calendar-data');
  });

  it('a body with no DAV:href, or malformed XML, is 400', async () => {
    expect((await handler.handle(requestBody([]), context())).status).toBe(400);
    expect(
      (await handler.handle('<C:calendar-multiget', context())).status,
    ).toBe(400);
  });

  it('ignores the Depth header (RFC 4791 §7.9)', async () => {
    await addEvent('a.ics', event('uid-a'));

    const result = await handler.handle(
      requestBody([href('a.ics')]),
      context({ depth: '0' }),
    );

    expect(result.status).toBe(207);
  });
});

describe('parseCalendarMultigetRequestBody (smoke, full coverage in its own test file)', () => {
  it('is re-exported and usable from this module’s own import path', () => {
    expect(() =>
      parseCalendarMultigetRequestBody(requestBody(['/a'])),
    ).not.toThrow();
  });
});
