import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  CalendarObject,
  CalendarObjectContent,
  createCalendarCollection,
  createDataSource,
  extractSchedulingParticipants,
  SchedulingInboxItem,
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

/** An organizer/attendee scheduling object resource. */
function event(options: {
  uid?: string;
  organizer: string;
  attendees: { address: string; partstat?: string }[];
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${options.uid ?? 'event-1'}`,
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260924T100000Z',
    'SUMMARY:Planning',
    `ORGANIZER:${options.organizer}`,
  ];
  for (const attendee of options.attendees) {
    lines.push(
      `ATTENDEE;PARTSTAT=${attendee.partstat ?? 'NEEDS-ACTION'}:${attendee.address}`,
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR', '');
  return lines.join('\r\n');
}

describe('CANCEL-Workflow (DELETE hook)', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
  let carol: User;
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
    carol = await createUser('carol');

    const initialization = {
      displayName: null,
      description: null,
      timezone: null,
      supportedComponentSet: ['VEVENT' as const],
      deadProperties: [],
    };
    await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: alice.principalId,
      name: 'work',
      initialization,
    });
    await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: bob.principalId,
      name: 'personal',
      initialization,
    });
    await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: carol.principalId,
      name: 'personal',
      initialization,
    });
    const users = dataSource.getRepository(User);
    alice = await users.findOneByOrFail({ id: alice.id });
    bob = await users.findOneByOrFail({ id: bob.id });
    carol = await users.findOneByOrFail({ id: carol.id });

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  function request(
    method: string,
    path: string,
    body?: string,
    username = 'alice',
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: basicAuthHeader(username, PASSWORD),
        ...(body ? { 'Content-Type': 'text/calendar; charset=utf-8' } : {}),
      },
      body,
    });
  }

  const workUrl = (name: string) =>
    `/dav/acme/calendars/${alice.principalId}/work/${name}`;
  const bobUrl = (name: string) =>
    `/dav/acme/calendars/${bob.principalId}/personal/${name}`;
  const carolUrl = (name: string) =>
    `/dav/acme/calendars/${carol.principalId}/personal/${name}`;

  const inboxItemsFor = (user: User) =>
    dataSource
      .getRepository(SchedulingInboxItem)
      .findBy({ ownerPrincipalId: user.principalId });

  it('delivers CANCEL to both attendees and removes their copies when the organizer deletes the event', async () => {
    await request(
      'PUT',
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [
          { address: `mailto:${bob.email}` },
          { address: `mailto:${carol.email}` },
        ],
      }),
    );
    expect(
      await request('GET', bobUrl('event-1.ics'), undefined, 'bob').then(
        (r) => r.status,
      ),
    ).toBe(200);

    const response = await request('DELETE', workUrl('event.ics'));

    expect(response.status).toBe(204);
    for (const [attendee, url] of [
      [bob, bobUrl('event-1.ics')],
      [carol, carolUrl('event-1.ics')],
    ] as const) {
      const items = await inboxItemsFor(attendee);
      expect(items).toHaveLength(2); // the initial REQUEST, then the CANCEL
      expect(items[1]?.method).toBe('CANCEL');
      const get = await request('GET', url, undefined, attendee.username);
      expect(get.status).toBe(404);
    }
  });

  it("delivers a DECLINED REPLY and merges it into the organizer's copy when an attendee deletes their own, unanswered invite", async () => {
    await request(
      'PUT',
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );

    const response = await request(
      'DELETE',
      bobUrl('event-1.ics'),
      undefined,
      'bob',
    );

    expect(response.status).toBe(204);
    const aliceItems = await inboxItemsFor(alice);
    expect(aliceItems).toHaveLength(1);
    expect(aliceItems[0]?.method).toBe('REPLY');

    const organizerObject = await dataSource
      .getRepository(CalendarObject)
      .findOneByOrFail({
        ownerPrincipalId: alice.principalId,
        uid: 'event-1',
      });
    const content = await dataSource
      .getRepository(CalendarObjectContent)
      .findOneByOrFail({ calendarObjectId: organizerObject.id });
    const participants = extractSchedulingParticipants(content.icsData);
    expect(participants.attendees[0]?.partstat).toBe('DECLINED');
  });

  it('deletes an ordinary (non-scheduling) event exactly like before M7, with no scheduling side effects', async () => {
    const plain = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:plain-1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260924T100000Z',
      'SUMMARY:Solo focus time',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    await request('PUT', workUrl('plain.ics'), plain);

    const response = await request('DELETE', workUrl('plain.ics'));

    expect(response.status).toBe(204);
    expect(await dataSource.getRepository(SchedulingInboxItem).count()).toBe(0);
    expect((await request('GET', workUrl('plain.ics'))).status).toBe(404);
  });
});
