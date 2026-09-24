import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  CalendarChange,
  CalendarCollection,
  CalendarObject,
  CalendarObjectAce,
  CalendarObjectContent,
  CalendarObjectProperty,
  createDataSource,
  MAX_CALENDAR_OBJECT_BYTES,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create } from 'xmlbuilder2';
import { createApp } from '../../../app.js';

const PASSWORD = 'correct horse battery staple';
const CALDAV = 'urn:ietf:params:xml:ns:caldav';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function etagOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** A single-event calendar object (CRLF line endings, as clients send it). */
function event(
  uid: string,
  options: { start?: string; summary?: string; extra?: string[] } = {},
): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    `DTSTART:${options.start ?? '20260924T100000Z'}`,
    `SUMMARY:${options.summary ?? 'Meeting'}`,
    ...(options.extra ?? []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** A weekly series whose second instance is moved by an override. */
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

/** Names of the elements of an XML document, in document order. */
function elementNames(xml: string): string[] {
  const names: string[] = [];
  const visit = (node: ReturnType<typeof create>): void => {
    node.each((child) => {
      const dom = child.node as unknown as {
        nodeType: number;
        localName: string;
      };
      if (dom.nodeType === 1) {
        names.push(dom.localName);
        visit(child as unknown as ReturnType<typeof create>);
      }
    });
  };
  visit(create(xml));
  return names;
}

describe('calendar object CRUD routes', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let calendar: CalendarCollection;
  let baseUrl: string;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    alice = await createUser('alice');
    calendar = await createCalendar(alice, 'work');

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  function createUser(username: string): Promise<User> {
    return new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username,
      email: `${username}@example.com`,
      password: PASSWORD,
    });
  }

  function createCalendar(
    owner: User,
    name: string,
  ): Promise<CalendarCollection> {
    const calendars = dataSource.getRepository(CalendarCollection);
    return calendars.save(
      calendars.create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.principalId,
        name,
        displayName: name,
      }),
    );
  }

  const url = (objectName: string, user: User = alice, calendarName = 'work') =>
    `/dav/acme/calendars/${user.principalId}/${calendarName}/${encodeURIComponent(objectName)}`;

  function request(
    method: string,
    path: string,
    options: {
      body?: string;
      username?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
        ...options.headers,
      },
      body: options.body,
    });
  }

  function put(
    path: string,
    body: string,
    headers: Record<string, string> = {},
    username?: string,
  ): Promise<Response> {
    return request('PUT', path, {
      body,
      username,
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...headers },
    });
  }

  const objects = () => dataSource.getRepository(CalendarObject);
  const reloadCalendar = () =>
    dataSource
      .getRepository(CalendarCollection)
      .findOneByOrFail({ id: calendar.id });

  describe('creating and reading', () => {
    it('stores a valid event and serves it back as text/calendar with a strong ETag', async () => {
      const ics = event('uid-1');

      const created = await put(url('event.ics'), ics);

      expect(created.status).toBe(201);
      expect(created.headers.get('etag')).toBe(etagOf(ics));

      const read = await request('GET', url('event.ics'));
      expect(read.status).toBe(200);
      expect(read.headers.get('content-type')).toBe(
        'text/calendar; charset=utf-8',
      );
      expect(read.headers.get('etag')).toBe(etagOf(ics));
      expect(await read.text()).toBe(ics);
    });

    it('stores a series with a RECURRENCE-ID override as one calendar object', async () => {
      const response = await put(url('series.ics'), SERIES);

      expect(response.status).toBe(201);
      expect(await objects().count()).toBe(1);
      const read = await request('GET', url('series.ics'));
      expect(await read.text()).toBe(SERIES);
    });

    it('round-trips text that needs more than ASCII', async () => {
      const ics = event('uid-1', { summary: 'Café ☕ Überraschung 😀' });

      await put(url('event.ics'), ics);

      const read = await request('GET', url('event.ics'));
      expect(await read.text()).toBe(ics);
    });

    it('indexes the event: time range and all-day flag are stored', async () => {
      const timed = await put(
        url('a.ics'),
        event('uid-a', { start: '20260924T100000Z' }),
      );
      const allDay = await put(
        url('b.ics'),
        event('uid-b').replace(
          'DTSTART:20260924T100000Z',
          'DTSTART;VALUE=DATE:20260925',
        ),
      );

      expect([timed.status, allDay.status]).toEqual([201, 201]);
      const a = await objects().findOneByOrFail({ name: 'a.ics' });
      const b = await objects().findOneByOrFail({ name: 'b.ics' });
      expect(a.dtstart.toISOString()).toBe('2026-09-24T10:00:00.000Z');
      expect(a.isAllDay).toBe(false);
      expect(b.dtstart.toISOString()).toBe('2026-09-25T00:00:00.000Z');
      expect(b.isAllDay).toBe(true);
    });

    it('gives the creator the default ACE and records the addition', async () => {
      await put(url('event.ics'), event('uid-1'));

      const object = await objects().findOneByOrFail({ name: 'event.ics' });
      expect(object.ownerPrincipalId).toBe(alice.principalId);
      expect(
        await dataSource
          .getRepository(CalendarObjectAce)
          .findBy({ calendarObjectId: object.id }),
      ).toEqual([
        expect.objectContaining({
          principalId: alice.principalId,
          privilege: 'all',
          protected: true,
        }),
      ]);
      expect((await reloadCalendar()).syncSeq).toBe(1);
      expect(
        (await dataSource.getRepository(CalendarChange).find()).map((c) => [
          c.name,
          c.action,
        ]),
      ).toEqual([['event.ics', 'added']]);
    });

    it('overwrites an existing event with 204, a new ETag and a modified change', async () => {
      await put(url('event.ics'), event('uid-1'));
      const updated = event('uid-1', {
        summary: 'Changed',
        start: '20261101T080000Z',
      });

      const response = await put(url('event.ics'), updated);

      expect(response.status).toBe(204);
      expect(response.headers.get('etag')).toBe(etagOf(updated));
      expect(await objects().count()).toBe(1);
      const stored = await objects().findOneByOrFail({ name: 'event.ics' });
      expect(stored.dtstart.toISOString()).toBe('2026-11-01T08:00:00.000Z');
      expect(await dataSource.getRepository(CalendarObjectAce).count()).toBe(1);
      expect(
        (
          await dataSource
            .getRepository(CalendarChange)
            .find({ order: { seq: 'ASC' } })
        ).map((c) => c.action),
      ).toEqual(['added', 'modified']);
      const read = await request('GET', url('event.ics'));
      expect(await read.text()).toBe(updated);
    });

    it('serves HEAD with the headers of GET and no body', async () => {
      const ics = event('uid-1');
      await put(url('event.ics'), ics);

      const response = await request('HEAD', url('event.ics'));

      expect(response.status).toBe(200);
      expect(response.headers.get('etag')).toBe(etagOf(ics));
      expect(await response.text()).toBe('');
    });

    it('answers a conditional GET with 304 when the ETag matches', async () => {
      const ics = event('uid-1');
      await put(url('event.ics'), ics);

      for (const header of [etagOf(ics), `"${etagOf(ics)}"`, '*']) {
        const response = await request('GET', url('event.ics'), {
          headers: { 'If-None-Match': header },
        });
        expect(response.status).toBe(304);
      }
      const changed = await request('GET', url('event.ics'), {
        headers: { 'If-None-Match': '"other"' },
      });
      expect(changed.status).toBe(200);
    });

    it('answers 404 for an object or calendar that does not exist', async () => {
      expect((await request('GET', url('nope.ics'))).status).toBe(404);
      expect(
        (await request('GET', url('event.ics', alice, 'missing'))).status,
      ).toBe(404);
    });

    it('answers 404 for GET on a calendar or the home', async () => {
      expect(
        (await request('GET', `/dav/acme/calendars/${alice.principalId}/work`))
          .status,
      ).toBe(404);
      expect(
        (await request('GET', `/dav/acme/calendars/${alice.principalId}`))
          .status,
      ).toBe(404);
    });
  });

  describe('preconditions of the data', () => {
    async function expectPrecondition(
      response: Response,
      status: number,
      precondition: string,
    ): Promise<void> {
      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toContain('application/xml');
      expect(elementNames(await response.text())).toEqual([
        'error',
        precondition,
      ]);
      expect(await objects().count()).toBe(0);
    }

    it('refuses a component type the calendar does not support with supported-calendar-component', async () => {
      const vtodo = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//x//EN',
        'BEGIN:VTODO',
        'UID:todo-1',
        'DTSTAMP:20260101T000000Z',
        'SUMMARY:Buy milk',
        'END:VTODO',
        'END:VCALENDAR',
        '',
      ].join('\r\n');

      await expectPrecondition(
        await put(url('todo.ics'), vtodo),
        403,
        'supported-calendar-component',
      );
    });

    it("refuses an event for a calendar whose component set doesn't include VEVENT", async () => {
      await dataSource
        .getRepository(CalendarCollection)
        .update({ id: calendar.id }, { supportedComponentSet: [] as never });

      await expectPrecondition(
        await put(url('event.ics'), event('uid-1')),
        403,
        'supported-calendar-component',
      );
    });

    it.each([
      ['not iCalendar at all', 'this is not a calendar'],
      ['an empty body', ''],
      ['a truncated object', 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'],
      [
        'an unsupported version',
        event('uid-1').replace('VERSION:2.0', 'VERSION:1.0'),
      ],
    ])('refuses %s with valid-calendar-data', async (_label, body) => {
      await expectPrecondition(
        await put(url('event.ics'), body),
        403,
        'valid-calendar-data',
      );
    });

    it.each([
      [
        'a METHOD property',
        event('uid-1').replace('VERSION:2.0', 'VERSION:2.0\r\nMETHOD:REQUEST'),
      ],
      [
        'components with different UIDs',
        event('uid-1').replace(
          'END:VCALENDAR',
          `${event('uid-2').split('BEGIN:VEVENT')[1].split('END:VCALENDAR')[0].replace(/^/, 'BEGIN:VEVENT')}END:VCALENDAR`,
        ),
      ],
    ])(
      'refuses %s with valid-calendar-object-resource',
      async (_label, body) => {
        await expectPrecondition(
          await put(url('event.ics'), body),
          403,
          'valid-calendar-object-resource',
        );
      },
    );

    it.each([
      ['a different media type', 'application/json'],
      ['plain text', 'text/plain'],
      ['another charset', 'text/calendar; charset=iso-8859-1'],
      ['a charset the server does not know', 'text/calendar; charset=nonsense'],
    ])(
      'refuses %s with supported-calendar-data',
      async (_label, contentType) => {
        await expectPrecondition(
          await put(url('event.ics'), event('uid-1'), {
            'Content-Type': contentType,
          }),
          403,
          'supported-calendar-data',
        );
      },
    );

    it.each([
      'text/calendar',
      'text/calendar; charset=utf-8',
      'text/calendar;charset="UTF-8"',
      'TEXT/Calendar; charset=UTF-8; component=VEVENT',
    ])('accepts the Content-Type %s', async (contentType) => {
      const response = await put(url('event.ics'), event('uid-1'), {
        'Content-Type': contentType,
      });

      expect(response.status).toBe(201);
    });

    it('refuses a body over the size limit with max-resource-size', async () => {
      const big = event('uid-1', {
        extra: [`DESCRIPTION:${'x'.repeat(MAX_CALENDAR_OBJECT_BYTES)}`],
      });

      await expectPrecondition(
        await put(url('event.ics'), big),
        403,
        'max-resource-size',
      );
    });

    it('accepts a large body below the limit', async () => {
      const large = event('uid-1', {
        extra: [`DESCRIPTION:${'x'.repeat(1024 * 1024)}`],
      });

      const response = await put(url('event.ics'), large);

      expect(response.status).toBe(201);
      const read = await request('GET', url('event.ics'));
      expect((await read.text()).length).toBe(large.length);
    });
  });

  describe('UIDs', () => {
    it('refuses a UID already used at another URL with 409 and names that resource', async () => {
      await put(url('first.ics'), event('shared-uid'));

      const response = await put(url('second.ics'), event('shared-uid'));

      expect(response.status).toBe(409);
      const xml = await response.text();
      expect(elementNames(xml)).toEqual(['error', 'no-uid-conflict', 'href']);
      const root = create(xml).root();
      const [href] = root.filter(
        (n) => n.node.localName === 'href',
        false,
        true,
      );
      expect(href?.node.textContent).toBe(
        `/dav/acme/calendars/${alice.principalId}/work/first.ics`,
      );
      const [conflict] = root.filter(
        (n) => n.node.localName === 'no-uid-conflict',
        false,
        true,
      );
      expect(conflict?.node.namespaceURI).toBe(CALDAV);
      expect(await objects().count()).toBe(1);
      expect((await reloadCalendar()).syncSeq).toBe(1);
    });

    it('percent-encodes the conflicting resource in the href', async () => {
      await put(url('a b&c.ics'), event('shared-uid'));

      const response = await put(url('other.ics'), event('shared-uid'));

      expect(await response.text()).toContain(
        `/work/${encodeURIComponent('a b&c.ics')}`,
      );
    });

    it('refuses an overwrite that changes the UID of the resource', async () => {
      await put(url('event.ics'), event('uid-1'));

      const response = await put(url('event.ics'), event('uid-2'));

      expect(response.status).toBe(409);
      expect(elementNames(await response.text())).toContain('no-uid-conflict');
      expect((await objects().findOneByOrFail({ name: 'event.ics' })).uid).toBe(
        'uid-1',
      );
    });

    it('allows the same UID in different calendars', async () => {
      await createCalendar(alice, 'private');
      await put(url('event.ics'), event('shared-uid'));

      const response = await put(
        url('event.ics', alice, 'private'),
        event('shared-uid'),
      );

      expect(response.status).toBe(201);
    });

    it('lets only one of several concurrent PUTs with the same UID create it', async () => {
      const statuses = (
        await Promise.all(
          ['a', 'b', 'c', 'd'].map((name) =>
            put(url(`${name}.ics`), event('same-uid')),
          ),
        )
      )
        .map((response) => response.status)
        .sort();

      expect(statuses).toEqual([201, 409, 409, 409]);
      expect(await objects().count()).toBe(1);
      expect(await dataSource.getRepository(CalendarObjectAce).count()).toBe(1);
    });
  });

  describe('conditional requests', () => {
    it('refuses If-None-Match: * on an existing URL with 412 and creates on a new one', async () => {
      await put(url('event.ics'), event('uid-1'));

      const taken = await put(
        url('event.ics'),
        event('uid-1', { summary: 'x' }),
        {
          'If-None-Match': '*',
        },
      );
      const fresh = await put(url('new.ics'), event('uid-2'), {
        'If-None-Match': '*',
      });

      expect(taken.status).toBe(412);
      expect(fresh.status).toBe(201);
      const stored = await objects().findOneByOrFail({ name: 'event.ics' });
      expect(stored.etag).toBe(etagOf(event('uid-1')));
    });

    it('refuses If-None-Match with the current ETag', async () => {
      const ics = event('uid-1');
      await put(url('event.ics'), ics);

      const response = await put(
        url('event.ics'),
        event('uid-1', { summary: 'y' }),
        {
          'If-None-Match': `"${etagOf(ics)}"`,
        },
      );

      expect(response.status).toBe(412);
    });

    it('overwrites with If-Match on the current ETag (bare, quoted, or *)', async () => {
      let current = event('uid-1');
      await put(url('event.ics'), current);

      for (const [index, format] of [
        (etag: string) => etag,
        (etag: string) => `"${etag}"`,
        () => '*',
      ].entries()) {
        const next = event('uid-1', { summary: `v${index}` });
        const response = await put(url('event.ics'), next, {
          'If-Match': format(etagOf(current)),
        });
        expect(response.status).toBe(204);
        current = next;
      }
    });

    it('refuses If-Match with another ETag, and on a URL that does not exist, with 412', async () => {
      const original = event('uid-1');
      await put(url('event.ics'), original);

      const stale = await put(
        url('event.ics'),
        event('uid-1', { summary: 'z' }),
        {
          'If-Match': '"stale"',
        },
      );
      const missing = await put(url('missing.ics'), event('uid-2'), {
        'If-Match': '*',
      });

      expect(stale.status).toBe(412);
      expect(missing.status).toBe(412);
      expect(
        (await objects().findOneByOrFail({ name: 'event.ics' })).etag,
      ).toBe(etagOf(original));
      expect(await objects().count()).toBe(1);
    });

    it('lets only one of several concurrent creates of the same URL win, the others get 412', async () => {
      const statuses = (
        await Promise.all(
          [1, 2, 3, 4].map((n) =>
            put(url('event.ics'), event(`uid-${n}`), { 'If-None-Match': '*' }),
          ),
        )
      )
        .map((response) => response.status)
        .sort();

      expect(statuses).toEqual([201, 412, 412, 412]);
      expect(await objects().count()).toBe(1);
    });

    it('lets only one of several concurrent If-Match overwrites win', async () => {
      const original = event('uid-1');
      await put(url('event.ics'), original);

      const statuses = (
        await Promise.all(
          [1, 2, 3, 4].map((n) =>
            put(url('event.ics'), event('uid-1', { summary: `v${n}` }), {
              'If-Match': etagOf(original),
            }),
          ),
        )
      )
        .map((response) => response.status)
        .sort();

      expect(statuses).toEqual([204, 412, 412, 412]);
    });
  });

  describe('where objects can be written', () => {
    it('answers 409 for a calendar that does not exist', async () => {
      const response = await put(
        url('event.ics', alice, 'missing'),
        event('uid-1'),
      );

      expect(response.status).toBe(409);
      expect(await objects().count()).toBe(0);
    });

    it('answers 405 for PUT on a calendar or on the home, and 409 below an object', async () => {
      const home = `/dav/acme/calendars/${alice.principalId}`;

      expect((await put(`${home}/work`, event('uid-1'))).status).toBe(405);
      expect((await put(home, event('uid-1'))).status).toBe(405);
      expect((await put(`${home}/work/a/b.ics`, event('uid-1'))).status).toBe(
        409,
      );
    });

    it.each([
      ['a control character', 'a%00b.ics'],
      ['more than 255 characters', `${'x'.repeat(256)}.ics`],
    ])('refuses an object name with %s with 403', async (_label, name) => {
      const response = await put(
        `/dav/acme/calendars/${alice.principalId}/work/${name}`,
        event('uid-1'),
      );

      expect(response.status).toBe(403);
      expect(await objects().count()).toBe(0);
    });

    it('accepts an object name with characters that need URL-encoding', async () => {
      const name = 'Team & Friends #1 (Ünï).ics';
      const ics = event('uid-1');

      expect((await put(url(name), ics)).status).toBe(201);

      const read = await request('GET', url(name));
      expect(await read.text()).toBe(ics);
    });
  });

  describe('access', () => {
    it("answers 403 for every method on another user's calendars, existing or not", async () => {
      const bob = await createUser('bob');
      await createCalendar(bob, 'private');
      await put(url('event.ics', bob, 'private'), event('uid-b'), {}, 'bob');
      const bobsObject = url('event.ics', bob, 'private');

      expect((await request('GET', bobsObject)).status).toBe(403);
      expect((await put(bobsObject, event('uid-x'))).status).toBe(403);
      expect((await request('DELETE', bobsObject)).status).toBe(403);
      expect(
        (await request('GET', url('nope.ics', bob, 'private'))).status,
      ).toBe(403);
      expect(
        (
          await request(
            'GET',
            '/dav/acme/calendars/00000000-0000-0000-0000-000000000000/x/y.ics',
          )
        ).status,
      ).toBe(403);
      expect((await objects().findOneByOrFail({ name: 'event.ics' })).uid).toBe(
        'uid-b',
      );
    });

    it('answers 401 without credentials', async () => {
      const response = await fetch(`${baseUrl}${url('event.ics')}`, {
        method: 'PUT',
        body: event('uid-1'),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('deleting', () => {
    it('removes the event; a later GET is 404', async () => {
      await put(url('event.ics'), event('uid-1'));

      const response = await request('DELETE', url('event.ics'));

      expect(response.status).toBe(204);
      expect((await request('GET', url('event.ics'))).status).toBe(404);
      expect(await objects().count()).toBe(0);
    });

    it('leaves no content, properties or ACEs behind, and records the deletion', async () => {
      await put(url('event.ics'), event('uid-1'));
      const object = await objects().findOneByOrFail({ name: 'event.ics' });
      await dataSource.getRepository(CalendarObjectProperty).save(
        dataSource.getRepository(CalendarObjectProperty).create({
          calendarObjectId: object.id,
          namespace: 'urn:example',
          name: 'note',
          value: 'x',
        }),
      );

      await request('DELETE', url('event.ics'));

      expect(
        await dataSource.getRepository(CalendarObjectContent).count(),
      ).toBe(0);
      expect(
        await dataSource.getRepository(CalendarObjectProperty).count(),
      ).toBe(0);
      expect(await dataSource.getRepository(CalendarObjectAce).count()).toBe(0);
      expect(
        (
          await dataSource
            .getRepository(CalendarChange)
            .find({ order: { seq: 'ASC' } })
        ).map((c) => c.action),
      ).toEqual(['added', 'deleted']);
    });

    it('frees the UID and the URL for a new object', async () => {
      await put(url('event.ics'), event('uid-1'));
      await request('DELETE', url('event.ics'));

      const response = await put(url('other.ics'), event('uid-1'));

      expect(response.status).toBe(201);
    });

    it('answers 404 for an object or calendar that does not exist', async () => {
      expect((await request('DELETE', url('nope.ics'))).status).toBe(404);
      expect(
        (await request('DELETE', url('event.ics', alice, 'missing'))).status,
      ).toBe(404);
    });

    it('honours If-Match: 412 for another ETag, delete for the current one', async () => {
      const ics = event('uid-1');
      await put(url('event.ics'), ics);

      const stale = await request('DELETE', url('event.ics'), {
        headers: { 'If-Match': '"stale"' },
      });
      expect(stale.status).toBe(412);
      expect(await objects().count()).toBe(1);

      const current = await request('DELETE', url('event.ics'), {
        headers: { 'If-Match': `"${etagOf(ics)}"` },
      });
      expect(current.status).toBe(204);
      expect(await objects().count()).toBe(0);
    });

    it('answers 405 for DELETE on a calendar or the home, which are not deletable here', async () => {
      const home = `/dav/acme/calendars/${alice.principalId}`;

      expect((await request('DELETE', `${home}/work`)).status).toBe(405);
      expect((await request('DELETE', home)).status).toBe(405);
      expect(await dataSource.getRepository(CalendarCollection).count()).toBe(
        1,
      );
    });

    it('answers 404 for a path below an object', async () => {
      await put(url('event.ics'), event('uid-1'));

      const response = await request('DELETE', `${url('event.ics')}/deeper`);

      expect(response.status).toBe(404);
      expect(await objects().count()).toBe(1);
    });
  });
});
