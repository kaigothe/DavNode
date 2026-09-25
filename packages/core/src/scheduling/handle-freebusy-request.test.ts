import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveCalendarObject } from '../caldav/calendar-object-writes.js';
import { createCalendarCollection } from '../caldav/create-calendar.js';
import { parseCalendarObject } from '../caldav/icalendar-parser.js';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarAce,
  CalendarCollection,
  Principal,
  Tenant,
  User,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { UserService } from '../services/user.service.js';
import { handleFreeBusyRequest } from './handle-freebusy-request.js';

const DEFAULT_INIT = {
  displayName: null,
  description: null,
  timezone: null,
  supportedComponentSet: ['VEVENT' as const],
  deadProperties: [],
};

function freebusyRequest(options: {
  uid?: string;
  organizer: string;
  attendees: string[];
  start?: string;
  end?: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'METHOD:REQUEST',
    'BEGIN:VFREEBUSY',
    `UID:${options.uid ?? 'fb-request-1'}`,
    'DTSTAMP:20260101T000000Z',
    `DTSTART:${options.start ?? '20260924T000000Z'}`,
    `DTEND:${options.end ?? '20260926T000000Z'}`,
    `ORGANIZER:${options.organizer}`,
    ...options.attendees.map((address) => `ATTENDEE:${address}`),
    'END:VFREEBUSY',
    'END:VCALENDAR',
    '',
  ];
  return lines.join('\r\n');
}

/** Extracts each `<C:response>`'s recipient/status/calendar-data from a `<C:schedule-response>` XML body, in document order. */
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

describe('handleFreeBusyRequest', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
  let carol: User;

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
    const userService = new UserService(dataSource);
    const createUser = (username: string): Promise<User> =>
      userService.createUser({
        tenantId: tenant.id,
        username,
        email: `${username}@example.com`,
        password: `pw-${username}`,
      });
    alice = await createUser('alice');
    bob = await createUser('bob');
    carol = await createUser('carol');
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function organizerPrincipal(): Promise<Principal> {
    return dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: alice.principalId });
  }

  async function putBusyEvent(
    owner: User,
    calendarName: string,
    uid: string,
    start: string,
    end: string,
  ): Promise<void> {
    const calendar = await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: owner.principalId,
      name: calendarName,
      initialization: DEFAULT_INIT,
    });
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      'DTSTAMP:20260101T000000Z',
      `DTSTART:${start}`,
      `DTEND:${end}`,
      'SUMMARY:Busy',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    await saveCalendarObject(dataSource, {
      tenantId: tenant.id,
      calendarId: calendar.id,
      name: `${uid}.ics`,
      ownerPrincipalId: owner.principalId,
      ics,
      parsed: parseCalendarObject(ics),
      etag: 'etag-1',
      existing: null,
    });
  }

  async function grantReadFreeBusy(
    owner: User,
    calendarName: string,
    grantee: User,
  ): Promise<void> {
    const calendars = await createCalendarCollectionIfMissing(
      owner,
      calendarName,
    );
    const aces = dataSource.getRepository(CalendarAce);
    await aces.save(
      aces.create({
        calendarId: calendars.id,
        principalId: grantee.principalId,
        privilege: 'read-free-busy',
        grantDeny: 'grant',
        protected: false,
        position: 10,
      }),
    );
  }

  async function createCalendarCollectionIfMissing(
    owner: User,
    calendarName: string,
  ) {
    const existing = await dataSource
      .getRepository(CalendarCollection)
      .findOneBy({
        tenantId: tenant.id,
        ownerPrincipalId: owner.principalId,
        name: calendarName,
      });
    if (existing) {
      return existing;
    }
    return createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: owner.principalId,
      name: calendarName,
      initialization: DEFAULT_INIT,
    });
  }

  it('returns a successful VFREEBUSY response for each of two local attendees', async () => {
    await putBusyEvent(
      bob,
      'work',
      'bob-busy-1',
      '20260924T110000Z',
      '20260924T120000Z',
    );
    await putBusyEvent(
      carol,
      'work',
      'carol-busy-1',
      '20260925T150000Z',
      '20260925T160000Z',
    );
    await grantReadFreeBusy(bob, 'work', alice);
    await grantReadFreeBusy(carol, 'work', alice);

    const xml = await handleFreeBusyRequest(dataSource, {
      tenant,
      organizerPrincipal: await organizerPrincipal(),
      requestIcs: freebusyRequest({
        organizer: `mailto:${alice.email}`,
        attendees: [`mailto:${bob.email}`, `mailto:${carol.email}`],
      }),
    });

    const responses = parseScheduleResponse(xml);
    expect(responses).toHaveLength(2);
    const bobResponse = responses.find(
      (r) => r.recipient === `mailto:${bob.email}`,
    );
    expect(bobResponse?.status).toBe('2.0;Success');
    expect(bobResponse?.calendarData).toContain('BEGIN:VFREEBUSY');
    expect(bobResponse?.calendarData).toContain(
      'FREEBUSY:20260924T110000Z/20260924T120000Z',
    );
    const carolResponse = responses.find(
      (r) => r.recipient === `mailto:${carol.email}`,
    );
    expect(carolResponse?.status).toBe('2.0;Success');
    expect(carolResponse?.calendarData).toContain(
      'FREEBUSY:20260925T150000Z/20260925T160000Z',
    );
  });

  it("answers 3.7 for an external attendee, without affecting the other attendee's response", async () => {
    await grantReadFreeBusy(bob, 'work', alice);

    const xml = await handleFreeBusyRequest(dataSource, {
      tenant,
      organizerPrincipal: await organizerPrincipal(),
      requestIcs: freebusyRequest({
        organizer: `mailto:${alice.email}`,
        attendees: [
          'mailto:stranger@elsewhere.example.com',
          `mailto:${bob.email}`,
        ],
      }),
    });

    const responses = parseScheduleResponse(xml);
    const strangerResponse = responses.find(
      (r) => r.recipient === 'mailto:stranger@elsewhere.example.com',
    );
    expect(strangerResponse?.status).toBe('3.7;Invalid calendar user');
    expect(strangerResponse?.calendarData).toBeNull();

    const bobResponse = responses.find(
      (r) => r.recipient === `mailto:${bob.email}`,
    );
    expect(bobResponse?.status).toBe('2.0;Success');
  });

  it('answers an access-denied status for an attendee who granted no read-free-busy/read', async () => {
    await createCalendarCollectionIfMissing(bob, 'personal');

    const xml = await handleFreeBusyRequest(dataSource, {
      tenant,
      organizerPrincipal: await organizerPrincipal(),
      requestIcs: freebusyRequest({
        organizer: `mailto:${alice.email}`,
        attendees: [`mailto:${bob.email}`],
      }),
    });

    const responses = parseScheduleResponse(xml);
    expect(responses).toHaveLength(1);
    expect(responses[0]?.status).toBe('3.8;No authority');
    expect(responses[0]?.calendarData).toBeNull();
  });

  it('rejects a structurally invalid request body', async () => {
    await expect(
      handleFreeBusyRequest(dataSource, {
        tenant,
        organizerPrincipal: await organizerPrincipal(),
        requestIcs: 'not a valid freebusy-request',
      }),
    ).rejects.toThrow();
  });
});
