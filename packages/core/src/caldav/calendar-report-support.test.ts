import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  CalendarObject,
  CalendarObjectContent,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import type { ReportContext } from '../webdav/report-registry.js';
import {
  buildCalendarObjectResponses,
  calendarObjectNameOf,
  checkSupportedCalendarData,
  findCalendarObjectsByName,
  resolveReportCalendar,
  toCalendarUrl,
} from './calendar-report-support.js';
import type { CalendarReportPropertySelection } from './calendar-report-request.js';

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

describe('resolveReportCalendar', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let owner: Principal;
  let calendar: CalendarCollection;

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
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        name: 'work',
        displayName: 'Work',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  const resolve = (...segments: string[]) =>
    resolveReportCalendar({
      tenant,
      principal: owner,
      manager: dataSource.manager,
      segments,
    } as ReportContext);

  it('resolves a calendar by owner and URL name, with or without a trailing slash', async () => {
    expect((await resolve('calendars', owner.id, 'work'))?.id).toBe(
      calendar.id,
    );
    expect((await resolve('calendars', owner.id, 'work', ''))?.id).toBe(
      calendar.id,
    );
  });

  it('does not resolve by display name, in another tree, or for the wrong owner or tenant', async () => {
    expect(await resolve('calendars', owner.id, 'Work')).toBeNull();
    expect(await resolve('addressbooks', owner.id, 'work')).toBeNull();
    expect(
      await resolve(
        'calendars',
        '00000000-0000-0000-0000-000000000000',
        'work',
      ),
    ).toBeNull();
    const other = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'other', name: 'Other Inc.' }),
      );
    expect(
      await resolveReportCalendar({
        tenant: other,
        principal: owner,
        manager: dataSource.manager,
        segments: ['calendars', owner.id, 'work'],
      } as ReportContext),
    ).toBeNull();
  });

  it('answers null for the home, an object path, an empty name and a userId that is no UUID', async () => {
    expect(await resolve('calendars', owner.id)).toBeNull();
    expect(
      await resolve('calendars', owner.id, 'work', 'event.ics'),
    ).toBeNull();
    expect(await resolve('calendars', owner.id, '')).toBeNull();
    expect(await resolve('calendars', 'not-a-uuid', 'work')).toBeNull();
    expect(await resolve()).toBeNull();
  });
});

describe('checkSupportedCalendarData', () => {
  it('accepts a request without prop, or prop without calendar-data', () => {
    expect(checkSupportedCalendarData({ kind: 'allprop' })).toBeNull();
    expect(
      checkSupportedCalendarData({
        kind: 'prop',
        properties: [],
        calendarData: null,
      }),
    ).toBeNull();
  });

  it('accepts an absent, or matching, content-type and version', () => {
    const selection: CalendarReportPropertySelection = {
      kind: 'prop',
      properties: [],
      calendarData: {
        contentType: undefined,
        version: undefined,
        expand: undefined,
      },
    };
    expect(checkSupportedCalendarData(selection)).toBeNull();
    expect(
      checkSupportedCalendarData({
        ...selection,
        calendarData: {
          contentType: 'text/calendar',
          version: '2.0',
          expand: undefined,
        },
      }),
    ).toBeNull();
    expect(
      checkSupportedCalendarData({
        ...selection,
        calendarData: {
          contentType: 'TEXT/CALENDAR',
          version: undefined,
          expand: undefined,
        },
      }),
    ).toBeNull();
  });

  it('rejects an unsupported content-type or version with 403 supported-calendar-data', () => {
    const base: CalendarReportPropertySelection = {
      kind: 'prop',
      properties: [],
      calendarData: {
        contentType: 'application/json',
        version: undefined,
        expand: undefined,
      },
    };
    const result = checkSupportedCalendarData(base);
    expect(result?.status).toBe(403);
    expect(result?.body).toContain('supported-calendar-data');

    const badVersion = checkSupportedCalendarData({
      ...base,
      calendarData: {
        contentType: undefined,
        version: '1.0',
        expand: undefined,
      },
    });
    expect(badVersion?.status).toBe(403);
  });
});

describe('calendarObjectNameOf', () => {
  // The real caller derives this from toCalendarUrl(...).split('/'), so it
  // always starts with the /dav/{tenant}/ prefix, not just 'calendars'.
  const segments = ['dav', 'acme', 'calendars', 'user-1', 'work'];

  it('resolves a name exactly one segment below the calendar', () => {
    expect(
      calendarObjectNameOf(
        '/dav/acme/calendars/user-1/work/event.ics',
        segments,
      ),
    ).toBe('event.ics');
  });

  it('decodes a percent-escaped name', () => {
    expect(
      calendarObjectNameOf(
        '/dav/acme/calendars/user-1/work/' + encodeURIComponent('a & b.ics'),
        segments,
      ),
    ).toBe('a & b.ics');
  });

  it('returns null for the calendar itself, another calendar, a deeper path, or an unparsable href', () => {
    expect(
      calendarObjectNameOf('/dav/acme/calendars/user-1/work', segments),
    ).toBeNull();
    expect(
      calendarObjectNameOf(
        '/dav/acme/calendars/user-1/private/event.ics',
        segments,
      ),
    ).toBeNull();
    expect(
      calendarObjectNameOf(
        '/dav/acme/calendars/user-1/work/sub/event.ics',
        segments,
      ),
    ).toBeNull();
    expect(calendarObjectNameOf('http://[::1', segments)).toBeNull();
  });

  it('accepts an absolute URL, using only its path', () => {
    expect(
      calendarObjectNameOf(
        'http://cal.example.com/dav/acme/calendars/user-1/work/event.ics',
        segments,
      ),
    ).toBe('event.ics');
  });
});

describe('buildCalendarObjectResponses and findCalendarObjectsByName', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let owner: Principal;
  let calendar: CalendarCollection;
  let event: CalendarObject;
  let context: ReportContext;

  const ICS =
    'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//x//EN\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260924T100000Z\r\nDTEND:20260924T110000Z\r\nSUMMARY:Meeting\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';

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
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        name: 'work',
        displayName: 'Work',
      }),
    );
    event = await dataSource.getRepository(CalendarObject).save(
      dataSource.getRepository(CalendarObject).create({
        tenantId: tenant.id,
        calendarId: calendar.id,
        name: 'event.ics',
        uid: '1',
        etag: 'etag-1',
        componentType: 'VEVENT',
        ownerPrincipalId: owner.id,
        dtstart: new Date('2026-09-24T10:00:00Z'),
      }),
    );
    await dataSource.getRepository(CalendarObjectContent).save(
      dataSource.getRepository(CalendarObjectContent).create({
        calendarObjectId: event.id,
        icsData: ICS,
      }),
    );
    context = {
      tenant,
      principal: owner,
      manager: dataSource.manager,
      segments: [],
    };
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('findCalendarObjectsByName finds exactly the named objects, batching beyond one chunk', async () => {
    const found = await findCalendarObjectsByName(
      dataSource.manager,
      calendar.id,
      ['event.ics', 'nope.ics'],
    );
    expect(found.map((o) => o.id)).toEqual([event.id]);

    expect(
      await findCalendarObjectsByName(dataSource.manager, calendar.id, []),
    ).toEqual([]);
  });

  it('allprop reports every live property, propname only names', async () => {
    const all = await buildCalendarObjectResponses(context, calendar, [event], {
      kind: 'allprop',
    });
    expect(all[0]?.href).toBe(`${toCalendarUrl(calendar, tenant)}/event.ics`);
    expect(all[0]?.properties.every((p) => p.status === 200)).toBe(true);
    expect(all[0]?.properties.some((p) => p.name === 'getetag')).toBe(true);

    const names = await buildCalendarObjectResponses(
      context,
      calendar,
      [event],
      {
        kind: 'propname',
      },
    );
    expect(names[0]?.properties.every((p) => p.value === undefined)).toBe(true);
  });

  it('prop with calendar-data returns the stored text, and 404s a property this server does not define', async () => {
    const responses = await buildCalendarObjectResponses(
      context,
      calendar,
      [event],
      {
        kind: 'prop',
        properties: [
          { namespace: 'DAV:', name: 'getetag' },
          { namespace: CALDAV, name: 'calendar-data' },
          { namespace: 'DAV:', name: 'nonexistent' },
        ],
        calendarData: {
          contentType: undefined,
          version: undefined,
          expand: undefined,
        },
      },
    );

    const props = responses[0]?.properties ?? [];
    expect(props.find((p) => p.name === 'calendar-data')).toMatchObject({
      value: ICS,
      status: 200,
    });
    expect(props.find((p) => p.name === 'getetag')).toMatchObject({
      status: 200,
    });
    expect(props.find((p) => p.name === 'nonexistent')).toMatchObject({
      status: 404,
    });
  });

  it('expands calendar-data when requested', async () => {
    const responses = await buildCalendarObjectResponses(
      context,
      calendar,
      [event],
      {
        kind: 'prop',
        properties: [{ namespace: CALDAV, name: 'calendar-data' }],
        calendarData: {
          contentType: undefined,
          version: undefined,
          expand: {
            start: new Date('2026-09-01T00:00:00Z'),
            end: new Date('2026-10-01T00:00:00Z'),
          },
        },
      },
      null,
    );

    const value = responses[0]?.properties[0]?.value ?? '';
    expect(value).toContain('RECURRENCE-ID:20260924T100000Z');
    expect(value).not.toContain('RRULE');
  });

  it('answers 415 supported-calendar-data-conversion for an unservable version', async () => {
    const responses = await buildCalendarObjectResponses(
      context,
      calendar,
      [event],
      {
        kind: 'prop',
        properties: [{ namespace: CALDAV, name: 'calendar-data' }],
        calendarData: {
          contentType: undefined,
          version: '1.0',
          expand: undefined,
        },
      },
    );

    expect(responses[0]?.status).toBe(415);
    expect(responses[0]?.error).toEqual([
      { namespace: CALDAV, name: 'supported-calendar-data-conversion' },
    ]);
  });

  it('does not load content when calendar-data was not requested', async () => {
    const responses = await buildCalendarObjectResponses(
      context,
      calendar,
      [event],
      {
        kind: 'prop',
        properties: [{ namespace: 'DAV:', name: 'getetag' }],
        calendarData: null,
      },
    );

    expect(responses[0]?.properties).toEqual([
      { namespace: 'DAV:', name: 'getetag', value: 'etag-1', status: 200 },
    ]);
  });
});
