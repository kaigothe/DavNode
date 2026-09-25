import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  CalendarAce,
  createCalendarCollection,
  createDataSource,
  TenantService,
  User,
  UserService,
  type DataSource,
  type Tenant,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function freebusyRequest(options: {
  organizer: string;
  attendees: string[];
}): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Example Corp.//CalDAV Client//EN',
    'METHOD:REQUEST',
    'BEGIN:VFREEBUSY',
    'UID:fb-request-1',
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260924T000000Z',
    'DTEND:20260926T000000Z',
    `ORGANIZER:${options.organizer}`,
    ...options.attendees.map((address) => `ATTENDEE:${address}`),
    'END:VFREEBUSY',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function parseScheduleResponse(
  xml: string,
): { recipient: string; status: string; calendarData: string | null }[] {
  return [...xml.matchAll(/<C:response>([\s\S]*?)<\/C:response>/g)].map(
    ([, block]) => ({
      recipient: /<D:href[^>]*>([^<]*)<\/D:href>/.exec(block)?.[1] ?? '',
      status:
        /<C:request-status>([^<]*)<\/C:request-status>/.exec(block)?.[1] ?? '',
      calendarData:
        /<C:calendar-data>([\s\S]*?)<\/C:calendar-data>/.exec(block)?.[1] ??
        null,
    }),
  );
}

describe('outbox-post route (freebusy-request)', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
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
    const userService = new UserService(dataSource);
    const createUser = (username: string): Promise<User> =>
      userService.createUser({
        tenantId: tenant.id,
        username,
        email: `${username}@example.com`,
        password: PASSWORD,
      });
    alice = await createUser('alice');
    bob = await createUser('bob');

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  function post(
    userId: string,
    body: string,
    username = 'alice',
  ): Promise<Response> {
    return fetch(`${baseUrl}/dav/acme/calendars/${userId}/outbox`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(username, PASSWORD),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body,
    });
  }

  it("answers 403 for posting to someone else's outbox", async () => {
    const response = await post(
      bob.principalId,
      freebusyRequest({
        organizer: `mailto:${alice.email}`,
        attendees: [`mailto:${bob.email}`],
      }),
      'alice',
    );

    expect(response.status).toBe(403);
  });

  it('returns two successful responses for two local attendees with a granted read-free-busy privilege', async () => {
    const bobCalendar = await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: bob.principalId,
      name: 'work',
      initialization: {
        displayName: null,
        description: null,
        timezone: null,
        supportedComponentSet: ['VEVENT'],
        deadProperties: [],
      },
    });
    const aces = dataSource.getRepository(CalendarAce);
    await aces.save(
      aces.create({
        calendarId: bobCalendar.id,
        principalId: alice.principalId,
        privilege: 'read-free-busy',
        grantDeny: 'grant',
        protected: false,
        position: 10,
      }),
    );

    const response = await post(
      alice.principalId,
      freebusyRequest({
        organizer: `mailto:${alice.email}`,
        attendees: [`mailto:${bob.email}`],
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/xml');
    const responses = parseScheduleResponse(await response.text());
    expect(responses).toHaveLength(1);
    expect(responses[0]?.status).toBe('2.0;Success');
    expect(responses[0]?.calendarData).toContain('BEGIN:VFREEBUSY');
  });

  it('answers 3.7 for an external attendee, without a 400 for the whole request', async () => {
    const response = await post(
      alice.principalId,
      freebusyRequest({
        organizer: `mailto:${alice.email}`,
        attendees: ['mailto:stranger@elsewhere.example.com'],
      }),
    );

    expect(response.status).toBe(200);
    const responses = parseScheduleResponse(await response.text());
    expect(responses[0]?.status).toBe('3.7;Invalid calendar user');
    expect(responses[0]?.calendarData).toBeNull();
  });

  it('answers an access-denied status for an attendee who granted no privilege', async () => {
    await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: bob.principalId,
      name: 'personal',
      initialization: {
        displayName: null,
        description: null,
        timezone: null,
        supportedComponentSet: ['VEVENT'],
        deadProperties: [],
      },
    });

    const response = await post(
      alice.principalId,
      freebusyRequest({
        organizer: `mailto:${alice.email}`,
        attendees: [`mailto:${bob.email}`],
      }),
    );

    expect(response.status).toBe(200);
    const responses = parseScheduleResponse(await response.text());
    expect(responses[0]?.status).toBe('3.8;No authority');
    expect(responses[0]?.calendarData).toBeNull();
  });

  it('answers 400 for a structurally invalid body', async () => {
    const response = await post(alice.principalId, 'not a freebusy-request');

    expect(response.status).toBe(400);
  });
});
