import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  CalendarAce,
  CalendarCollection,
  CalendarObject,
  createDataSource,
  createOwnerAllAce,
  parseCalendarObject,
  saveCalendarObject,
  TenantService,
  UserService,
  type CalendarPrivilege,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { createApp } from '../../../app.js';

/** The password every test user has. */
export const PASSWORD = 'correct horse battery staple';

/** A `Basic` `Authorization` header value. */
export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/** The strong ETag the routes derive from a body. */
export function etagOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** A single-event calendar object with CRLF line endings, as clients send it. */
export function eventIcs(uid: string, summary = 'Meeting'): string {
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

/** A `DAV:lockinfo` body for a write lock. */
export function lockInfoBody(
  scope: 'exclusive' | 'shared' = 'exclusive',
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:${scope}/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
</D:lockinfo>`;
}

/**
 * A running app over an in-memory database with two users, alice and bob,
 * alice's calendar `work` (as MKCALENDAR creates it, owner ACE included)
 * and one event `event.ics` in it (written by the real write path).
 */
export interface CalendarWorld {
  dataSource: DataSource;
  tenant: Tenant;
  alice: User;
  bob: User;
  calendar: CalendarCollection;
  event: CalendarObject;
  /** The stored text of `event.ics`. */
  eventIcs: string;
  /** Alice's home URL. */
  home: string;
  /** URL of the calendar `work`. */
  calendarUrl: string;
  /** URL of the event. */
  eventUrl: string;
  /** Sends a request as `username` (alice by default). */
  request(
    method: string,
    path: string,
    options?: {
      body?: string;
      username?: string;
      headers?: Record<string, string>;
    },
  ): Promise<Response>;
  /** Puts `body` at `path` as `username`, as `text/calendar`. */
  put(
    path: string,
    body: string,
    username?: string,
    headers?: Record<string, string>,
  ): Promise<Response>;
  /** Adds an ACE to alice's calendar. */
  grantOnCalendar(
    user: User,
    privilege: CalendarPrivilege,
    grantDeny?: 'grant' | 'deny',
    position?: number,
  ): Promise<void>;
  /** Stops the server and closes the database. */
  close(): Promise<void>;
}

/** Builds a {@link CalendarWorld}. */
export async function createCalendarWorld(): Promise<CalendarWorld> {
  const dataSource = createDataSource(
    {},
    { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
  );
  await dataSource.initialize();
  await dataSource.runMigrations();

  const tenant = await new TenantService(dataSource).createTenant({
    slug: 'acme',
    name: 'Acme Inc.',
  });
  const userService = new UserService(dataSource);
  const createUser = (username: string): Promise<User> =>
    userService.createUser({
      tenantId: tenant.id,
      username,
      email: `${username}@example.com`,
      password: PASSWORD,
    });
  const alice = await createUser('alice');
  const bob = await createUser('bob');

  const calendar = await dataSource.transaction(async (manager) => {
    const created = await manager.getRepository(CalendarCollection).save(
      manager.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        name: 'work',
        displayName: 'Work',
      }),
    );
    await createOwnerAllAce(manager, 'calendar', created.id, alice.principalId);
    return created;
  });
  const storedIcs = eventIcs('uid-1');
  const { object: event } = await saveCalendarObject(dataSource, {
    tenantId: tenant.id,
    calendarId: calendar.id,
    name: 'event.ics',
    ownerPrincipalId: alice.principalId,
    ics: storedIcs,
    parsed: parseCalendarObject(storedIcs),
    etag: etagOf(storedIcs),
    existing: null,
  });

  const server = createApp(dataSource).listen(0);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const home = `/dav/acme/calendars/${alice.principalId}`;

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

  return {
    dataSource,
    tenant,
    alice,
    bob,
    calendar,
    event,
    eventIcs: storedIcs,
    home,
    calendarUrl: `${home}/work`,
    eventUrl: `${home}/work/event.ics`,
    request,
    put: (path, body, username, headers = {}) =>
      request('PUT', path, {
        body,
        username,
        headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...headers },
      }),
    async grantOnCalendar(user, privilege, grantDeny = 'grant', position = 10) {
      const aces = dataSource.getRepository(CalendarAce);
      await aces.save(
        aces.create({
          calendarId: calendar.id,
          principalId: user.principalId,
          privilege,
          grantDeny,
          position,
        }),
      );
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await dataSource.destroy();
    },
  };
}
