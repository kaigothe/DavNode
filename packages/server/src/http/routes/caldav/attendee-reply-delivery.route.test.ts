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
  extra?: string[];
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
    ...(options.extra ?? []),
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

describe('attendee reply delivery (PUT hook)', () => {
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
    const users = dataSource.getRepository(User);
    alice = await users.findOneByOrFail({ id: alice.id });
    bob = await users.findOneByOrFail({ id: bob.id });

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  function put(
    path: string,
    body: string,
    username = 'alice',
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: {
        Authorization: basicAuthHeader(username, PASSWORD),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body,
    });
  }

  const workUrl = (name: string) =>
    `/dav/acme/calendars/${alice.principalId}/work/${name}`;
  const bobUrl = (name: string) =>
    `/dav/acme/calendars/${bob.principalId}/personal/${name}`;

  const inboxItemsFor = (user: User) =>
    dataSource
      .getRepository(SchedulingInboxItem)
      .findBy({ ownerPrincipalId: user.principalId });

  async function organizerCopyIcs(): Promise<string> {
    const object = await dataSource
      .getRepository(CalendarObject)
      .findOneByOrFail({
        ownerPrincipalId: alice.principalId,
        uid: 'event-1',
      });
    const content = await dataSource
      .getRepository(CalendarObjectContent)
      .findOneByOrFail({ calendarObjectId: object.id });
    return content.icsData;
  }

  it("delivers a REPLY when bob accepts, and merges it into alice's own copy", async () => {
    await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );

    const response = await put(
      bobUrl('event-1.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}`, partstat: 'ACCEPTED' }],
      }),
      'bob',
    );

    expect(response.status).toBe(204);
    const aliceItems = await inboxItemsFor(alice);
    expect(aliceItems).toHaveLength(1);
    expect(aliceItems[0]?.method).toBe('REPLY');

    const participants = extractSchedulingParticipants(
      await organizerCopyIcs(),
    );
    expect(participants.attendees[0]?.partstat).toBe('ACCEPTED');
  });

  it('does not deliver a reply for a PUT that leaves PARTSTAT unchanged', async () => {
    await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );

    const response = await put(
      bobUrl('event-1.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
        extra: ['DESCRIPTION:my private note'],
      }),
      'bob',
    );

    expect(response.status).toBe(204);
    expect(await inboxItemsFor(alice)).toHaveLength(0);
  });

  it('does not send a fresh REQUEST to anyone as a side effect of the reply merge', async () => {
    await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );
    const initialBobItems = await inboxItemsFor(bob);
    expect(initialBobItems).toHaveLength(1); // the initial REQUEST

    await put(
      bobUrl('event-1.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}`, partstat: 'ACCEPTED' }],
      }),
      'bob',
    );

    // Bob's own reply-triggering PUT must not cause a new REQUEST back to
    // himself — the merge is an internal write, not a fresh organizer PUT.
    expect(await inboxItemsFor(bob)).toHaveLength(1);
  });
});
