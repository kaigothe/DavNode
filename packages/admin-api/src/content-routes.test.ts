import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  AddressObject,
  AddressObjectContent,
  AddressbookCollection,
  CalendarCollection,
  CalendarProperty,
  CalendarObject,
  CalendarObjectContent,
  computeTimeRangeIndex,
  createDataSource,
  indexVCard,
  parseCalendarObject,
  parseVCard,
  Principal,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminErrorBody } from './admin-error-response.js';
import type { ContentAccess } from './content-routes.js';
import { createAdminRouter, type AdminRouterOptions } from './router.js';

const ics = (body: string) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    body,
    'END:VCALENDAR',
    '',
  ].join('\r\n');

const WEEKLY = ics(
  [
    'BEGIN:VEVENT',
    'UID:weekly@test',
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260105T090000Z',
    'DTEND:20260105T100000Z',
    'RRULE:FREQ=WEEKLY;COUNT=4',
    'SUMMARY:Standup',
    'LOCATION:Room 1',
    'DESCRIPTION:Daily sync',
    'END:VEVENT',
  ].join('\r\n'),
);

const EVIL = ics(
  [
    'BEGIN:VEVENT',
    'UID:evil@test',
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260110T090000Z',
    'DTEND:20260110T100000Z',
    'SUMMARY:<script>alert(1)</script>',
    'END:VEVENT',
  ].join('\r\n'),
);

const vcard = (uid: string, fn: string, extra: string[] = []) =>
  [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${uid}`,
    `FN:${fn}`,
    ...extra,
    'END:VCARD',
    '',
  ].join('\r\n');

describe('content routes', () => {
  let dataSource: DataSource;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;
  let acme: Tenant;
  let other: Tenant;
  let boss: User;
  let alice: User;
  let calendar: CalendarCollection;
  let book: AddressbookCollection;
  let accesses: ContentAccess[];

  beforeEach(async () => {
    accesses = [];
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    const tenants = new TenantService(dataSource);
    acme = await tenants.createTenant({ slug: 'acme', name: 'Acme' });
    other = await tenants.createTenant({ slug: 'other', name: 'Other' });
    const users = new UserService(dataSource);
    boss = await users.createUser({
      tenantId: acme.id,
      username: 'boss',
      email: 'boss@example.com',
      password: 'pw',
      role: 'tenant_admin',
    });
    alice = await users.createUser({
      tenantId: acme.id,
      username: 'alice',
      email: 'alice@example.com',
      password: 'pw',
    });

    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: acme.id,
        ownerPrincipalId: alice.principalId,
        name: 'work',
        displayName: 'Work',
        supportedComponentSet: ['VEVENT'],
      }),
    );
    await addEvent('weekly.ics', WEEKLY);
    await addEvent('evil.ics', EVIL);

    book = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: acme.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Contacts',
      }),
    );
    await addContact(
      'ada.vcf',
      vcard('ada', 'Ada Lovelace', [
        'EMAIL;TYPE=WORK:ada@analytical.example',
        'TEL;TYPE=CELL:+49 170 1234567',
        'ORG:Analytical Engines;Research',
        'ADR;TYPE=HOME:;;1 Main St;London;;N1;UK',
      ]),
    );
    await addContact('bob.vcf', vcard('bob', 'Bob Müller'));
    await addContact('carl.vcf', vcard('carl', 'Carl 100%'));
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await dataSource.destroy();
  });

  async function addEvent(name: string, text: string): Promise<void> {
    const parsed = parseCalendarObject(text);
    const object = await dataSource.getRepository(CalendarObject).save(
      dataSource.getRepository(CalendarObject).create({
        tenantId: acme.id,
        calendarId: calendar.id,
        name,
        uid: parsed.uid,
        etag: `"${name}"`,
        componentType: 'VEVENT',
        ownerPrincipalId: alice.principalId,
        ...computeTimeRangeIndex(parsed),
      }),
    );
    await dataSource
      .getRepository(CalendarObjectContent)
      .save({ calendarObjectId: object.id, icsData: text });
  }

  async function addContact(name: string, text: string): Promise<void> {
    const parsed = parseVCard(text);
    const object = await dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: acme.id,
        addressbookId: book.id,
        name,
        uid: parsed.uid,
        etag: `"${name}"`,
        ownerPrincipalId: alice.principalId,
      }),
    );
    await dataSource
      .getRepository(AddressObjectContent)
      .save({ addressObjectId: object.id, vcardData: text });
    await dataSource.transaction((manager) =>
      indexVCard(manager, object.id, parsed),
    );
  }

  function mountAs(
    managed: Tenant,
    user: User,
    options: AdminRouterOptions = { contentView: true },
  ): void {
    const app = express();
    app.use(async (req: Request, _res: Response, next: NextFunction) => {
      req.tenant = managed;
      req.principal = await dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: user.principalId });
      next();
    });
    app.use(
      '/admin',
      createAdminRouter(dataSource, {
        onContentAccess: (access) => accesses.push(access),
        ...options,
      }),
    );
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const get = (path: string) => fetch(`${baseUrl}/admin${path}`);
  const errorCode = async (response: globalThis.Response) =>
    ((await response.json()) as AdminErrorBody).error.code;
  const eventsUrl = (from: string, to: string, extra = '') =>
    `/users/${alice.id}/calendars/${calendar.id}/events?from=${from}&to=${to}${extra}`;

  describe('when the content view is off', () => {
    it('does not register the routes (404)', async () => {
      mountAs(acme, boss, {});

      expect((await get(`/users/${alice.id}/calendars`)).status).toBe(404);
      expect((await get(`/users/${alice.id}/addressbooks`)).status).toBe(404);
      expect(accesses).toEqual([]);
    });
  });

  describe('calendars', () => {
    beforeEach(() => mountAs(acme, boss));

    it('lists the calendars of a user with their object counts', async () => {
      const response = await get(`/users/${alice.id}/calendars`);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        calendars: [{ id: calendar.id, displayName: 'Work', objectCount: 2 }],
      });
    });

    it('gives the colour a client set, as #rrggbb, and null otherwise', async () => {
      const properties = dataSource.getRepository(CalendarProperty);
      await properties.save({
        calendarId: calendar.id,
        namespace: 'http://apple.com/ns/ical/',
        name: 'calendar-color',
        value: '#FF2968FF',
      });
      const second = await dataSource.getRepository(CalendarCollection).save(
        dataSource.getRepository(CalendarCollection).create({
          tenantId: acme.id,
          ownerPrincipalId: alice.principalId,
          name: 'odd',
          displayName: 'Odd',
          supportedComponentSet: ['VEVENT'],
        }),
      );
      await properties.save({
        calendarId: second.id,
        namespace: 'http://apple.com/ns/ical/',
        name: 'calendar-color',
        value: 'red;background:url(x)',
      });
      const third = await dataSource.getRepository(CalendarCollection).save(
        dataSource.getRepository(CalendarCollection).create({
          tenantId: acme.id,
          ownerPrincipalId: alice.principalId,
          name: 'plain',
          displayName: 'Plain',
          supportedComponentSet: ['VEVENT'],
        }),
      );

      const body = (await (
        await get(`/users/${alice.id}/calendars`)
      ).json()) as {
        calendars: { id: string; color: string | null }[];
      };

      const color = (id: string) =>
        body.calendars.find((c) => c.id === id)?.color;
      expect(color(calendar.id)).toBe('#ff2968');
      expect(color(second.id)).toBeNull();
      expect(color(third.id)).toBeNull();
    });

    it('expands a recurring event into its instances within the window', async () => {
      const response = await get(
        eventsUrl('2026-01-01T00:00:00Z', '2026-01-20T00:00:00Z'),
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        events: {
          summary: string;
          start: string;
          location: string | null;
          description: string | null;
          isRecurring: boolean;
        }[];
        truncated: boolean;
      };
      const standups = body.events.filter(
        (event) => event.summary === 'Standup',
      );
      expect(standups.map((event) => event.start)).toEqual([
        '2026-01-05T09:00:00.000Z',
        '2026-01-12T09:00:00.000Z',
        '2026-01-19T09:00:00.000Z',
      ]);
      expect(standups[0]).toMatchObject({
        location: 'Room 1',
        description: 'Daily sync',
        isRecurring: true,
      });
      expect(body.truncated).toBe(false);
    });

    it('returns the event text verbatim for escaping by the client', async () => {
      const body = (await (
        await get(eventsUrl('2026-01-09T00:00:00Z', '2026-01-11T00:00:00Z'))
      ).json()) as { events: { summary: string }[] };

      expect(body.events.map((event) => event.summary)).toEqual([
        '<script>alert(1)</script>',
      ]);
    });

    it('includes the raw iCalendar only on request', async () => {
      const range = eventsUrl('2026-01-09T00:00:00Z', '2026-01-11T00:00:00Z');
      const plain = (await (await get(range)).json()) as {
        events: { raw?: string }[];
      };
      const raw = (await (await get(`${range}&raw=true`)).json()) as {
        events: { raw?: string }[];
      };

      expect(plain.events[0]?.raw).toBeUndefined();
      expect(raw.events[0]?.raw).toContain('UID:evil@test');
    });

    it.each([
      ['no range', ''],
      ['unparseable', '?from=yesterday&to=today'],
      ['reversed', '?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z'],
    ])('rejects %s (400 invalid_range)', async (_name, query) => {
      const response = await get(
        `/users/${alice.id}/calendars/${calendar.id}/events${query}`,
      );

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe('invalid_range');
    });

    it('rejects a window longer than a year (400 range_too_large)', async () => {
      const response = await get(
        eventsUrl('2026-01-01T00:00:00Z', '2028-01-01T00:00:00Z'),
      );

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe('range_too_large');
    });

    it('answers 404 for an unknown calendar and for another user’s calendar', async () => {
      const unknown = await get(
        `/users/${alice.id}/calendars/${crypto.randomUUID()}/events?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z`,
      );
      const foreign = await get(
        `/users/${boss.id}/calendars/${calendar.id}/events?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z`,
      );

      expect(unknown.status).toBe(404);
      expect(await errorCode(unknown)).toBe('calendar_not_found');
      expect(foreign.status).toBe(404);
    });

    it('answers 404 for an unknown user', async () => {
      const response = await get(`/users/${crypto.randomUUID()}/calendars`);

      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe('user_not_found');
    });
  });

  describe('address books', () => {
    beforeEach(() => mountAs(acme, boss));

    const contactsUrl = (query = '') =>
      `/users/${alice.id}/addressbooks/${book.id}/contacts${query}`;

    it('lists the address books with their contact counts', async () => {
      const body = await (await get(`/users/${alice.id}/addressbooks`)).json();

      expect(body).toMatchObject({
        addressbooks: [
          { id: book.id, displayName: 'Contacts', contactCount: 3 },
        ],
      });
    });

    it('projects a contact into display-ready fields', async () => {
      const body = (await (await get(contactsUrl('?q=ada'))).json()) as {
        contacts: Record<string, unknown>[];
        total: number;
      };

      expect(body.total).toBe(1);
      expect(body.contacts[0]).toMatchObject({
        displayName: 'Ada Lovelace',
        organization: 'Analytical Engines, Research',
        emails: [{ value: 'ada@analytical.example', types: ['work'] }],
        phones: [{ value: '+49 170 1234567', types: ['cell'] }],
        addresses: ['1 Main St, London, N1, UK'],
        hasPhoto: false,
      });
      expect(body.contacts[0]).not.toHaveProperty('raw');
    });

    it('pages through the contacts and reports the total', async () => {
      const first = (await (await get(contactsUrl('?limit=2'))).json()) as {
        contacts: { name: string }[];
        total: number;
      };
      const second = (await (
        await get(contactsUrl('?limit=2&offset=2'))
      ).json()) as { contacts: { name: string }[] };

      expect(first.total).toBe(3);
      expect(first.contacts.map((c) => c.name)).toEqual(['ada.vcf', 'bob.vcf']);
      expect(second.contacts.map((c) => c.name)).toEqual(['carl.vcf']);
    });

    it('searches case-insensitively and treats % literally', async () => {
      const mueller = (await (await get(contactsUrl('?q=MÜLLER'))).json()) as {
        total: number;
      };
      const percent = (await (await get(contactsUrl('?q=100%25'))).json()) as {
        contacts: { name: string }[];
      };
      const wildcard = (await (await get(contactsUrl('?q=%25'))).json()) as {
        total: number;
      };

      expect(mueller.total).toBe(1);
      expect(percent.contacts.map((c) => c.name)).toEqual(['carl.vcf']);
      expect(wildcard.total).toBe(1);
    });

    it('includes the raw vCard only on request', async () => {
      const body = (await (
        await get(contactsUrl('?q=ada&raw=true'))
      ).json()) as { contacts: { raw?: string }[] };

      expect(body.contacts[0]?.raw).toContain('UID:ada');
    });

    it('answers 404 for an unknown address book', async () => {
      const response = await get(
        `/users/${alice.id}/addressbooks/${crypto.randomUUID()}/contacts`,
      );

      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe('addressbook_not_found');
    });
  });

  describe('authorization and audit', () => {
    it('is forbidden for a member (403)', async () => {
      mountAs(acme, alice);

      expect((await get(`/users/${alice.id}/calendars`)).status).toBe(403);
      expect(accesses).toEqual([]);
    });

    it('is forbidden for a tenant_admin of another tenant (403)', async () => {
      mountAs(acme, await otherAdmin());

      const response = await get(`/users/${alice.id}/addressbooks`);

      expect(response.status).toBe(403);
      expect(accesses).toEqual([]);
    });

    it('does not reach users of another tenant (404)', async () => {
      const admin = await otherAdmin();
      mountAs(other, admin);

      const response = await get(`/users/${alice.id}/calendars`);

      expect(response.status).toBe(404);
    });

    it('reports every read with admin, target and collection', async () => {
      mountAs(acme, boss);

      await get(`/users/${alice.id}/calendars`);
      await get(eventsUrl('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'));
      await get(`/users/${alice.id}/addressbooks`);
      await get(`/users/${alice.id}/addressbooks/${book.id}/contacts`);

      expect(accesses).toEqual([
        expect.objectContaining({
          adminPrincipalId: boss.principalId,
          targetUserId: alice.id,
          tenantSlug: 'acme',
          resource: 'calendars',
        }),
        expect.objectContaining({
          resource: 'events',
          collectionId: calendar.id,
        }),
        expect.objectContaining({ resource: 'addressbooks' }),
        expect.objectContaining({
          resource: 'contacts',
          collectionId: book.id,
        }),
      ]);
    });
  });

  async function otherAdmin(): Promise<User> {
    return new UserService(dataSource).createUser({
      tenantId: other.id,
      username: 'otheradmin',
      email: 'o@example.com',
      password: 'pw',
      role: 'tenant_admin',
    });
  }
});
