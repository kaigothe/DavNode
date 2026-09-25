import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  CalendarObject,
  CalendarObjectContent,
  createCalendarCollection,
  createDataSource,
  extractSchedulingParticipants,
  parseCalendarObject,
  saveCalendarObject,
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
  dtstart?: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${options.uid ?? 'event-1'}`,
    'DTSTAMP:20260101T000000Z',
    `DTSTART:${options.dtstart ?? '20260924T100000Z'}`,
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

describe('organizer invite delivery (PUT hook)', () => {
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
    // Reload — createCalendarCollection sets defaultCalendarId as a side
    // effect, after these were originally fetched.
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

  const inboxItemsFor = (user: User) =>
    dataSource
      .getRepository(SchedulingInboxItem)
      .findBy({ ownerPrincipalId: user.principalId });

  const copyFor = (user: User, uid: string) =>
    dataSource
      .getRepository(CalendarObject)
      .findOneBy({ calendarId: user.defaultCalendarId ?? '', uid });

  async function icsOf(object: CalendarObject): Promise<string> {
    const content = await dataSource
      .getRepository(CalendarObjectContent)
      .findOneByOrFail({ calendarObjectId: object.id });
    return content.icsData;
  }

  it('creates two inbox REQUESTs and two auto-filed NEEDS-ACTION copies for a new event with two local attendees', async () => {
    const response = await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [
          { address: `mailto:${bob.email}` },
          { address: `mailto:${carol.email}` },
        ],
      }),
    );

    expect(response.status).toBe(201);
    for (const attendee of [bob, carol]) {
      const items = await inboxItemsFor(attendee);
      expect(items).toHaveLength(1);
      expect(items[0]?.method).toBe('REQUEST');
      const copy = await copyFor(attendee, 'event-1');
      expect(copy).not.toBeNull();
      const participants = extractSchedulingParticipants(await icsOf(copy!));
      expect(
        participants.attendees.find(
          (a) => a.address.toLowerCase() === `mailto:${attendee.email}`,
        )?.partstat,
      ).toBe('NEEDS-ACTION');
    }
  });

  it('sends a CANCEL and removes the copy for a removed attendee, keeping the remaining one', async () => {
    await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [
          { address: `mailto:${bob.email}` },
          { address: `mailto:${carol.email}` },
        ],
      }),
    );

    const response = await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );

    expect(response.status).toBe(204);
    const carolItems = await inboxItemsFor(carol);
    expect(carolItems.at(-1)?.method).toBe('CANCEL');
    expect(await copyFor(carol, 'event-1')).toBeNull();
    expect(await copyFor(bob, 'event-1')).not.toBeNull();
  });

  it("keeps an already-accepted attendee's PARTSTAT after the organizer moves the time", async () => {
    await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );
    const bobCopy = await copyFor(bob, 'event-1');
    const acceptedIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}`, partstat: 'ACCEPTED' }],
    });
    await saveCalendarObject(dataSource, {
      tenantId: tenant.id,
      calendarId: bob.defaultCalendarId!,
      name: bobCopy!.name,
      ownerPrincipalId: bob.principalId,
      ics: acceptedIcs,
      parsed: parseCalendarObject(acceptedIcs),
      etag: 'etag-accepted',
      existing: bobCopy,
    });

    const response = await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
        dtstart: '20261001T140000Z',
      }),
    );

    expect(response.status).toBe(204);
    const updatedCopy = await copyFor(bob, 'event-1');
    const participants = extractSchedulingParticipants(
      await icsOf(updatedCopy!),
    );
    expect(participants.attendees[0]?.partstat).toBe('ACCEPTED');
  });

  it('bumps SEQUENCE on the organizer copy when re-announcing an update', async () => {
    await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );

    await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
        dtstart: '20261001T140000Z',
      }),
    );

    const get = await fetch(`${baseUrl}${workUrl('event.ics')}`, {
      headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
    });
    const storedIcs = await get.text();
    expect(storedIcs).toContain('SEQUENCE:1');
  });

  it('saves an event with only external attendees normally, without error or inbox delivery', async () => {
    const response = await put(
      workUrl('event.ics'),
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: 'mailto:stranger@elsewhere.example.com' }],
      }),
    );

    expect(response.status).toBe(201);
    expect(await dataSource.getRepository(SchedulingInboxItem).count()).toBe(0);
  });

  it('does not affect a plain event with no ORGANIZER/ATTENDEE at all', async () => {
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

    const response = await put(workUrl('plain.ics'), plain);

    expect(response.status).toBe(201);
    expect(await dataSource.getRepository(SchedulingInboxItem).count()).toBe(0);
  });
});
