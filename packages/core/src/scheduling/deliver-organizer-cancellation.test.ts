import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveCalendarObject } from '../caldav/calendar-object-writes.js';
import { createCalendarCollection } from '../caldav/create-calendar.js';
import { parseCalendarObject } from '../caldav/icalendar-parser.js';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarObject,
  SchedulingInboxItem,
  Tenant,
  User,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { UserService } from '../services/user.service.js';
import { deliverOrganizerCancellation } from './deliver-organizer-cancellation.js';
import { extractSchedulingParticipants } from './detect-scheduling-role.js';

const DEFAULT_INIT = {
  displayName: null,
  description: null,
  timezone: null,
  supportedComponentSet: ['VEVENT' as const],
  deadProperties: [],
};

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

describe('deliverOrganizerCancellation', () => {
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

  async function fileAttendeeCopy(
    attendee: User,
    ics: string,
  ): Promise<string> {
    const calendar = await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: attendee.principalId,
      name: 'personal',
      initialization: DEFAULT_INIT,
    });
    await saveCalendarObject(dataSource, {
      tenantId: tenant.id,
      calendarId: calendar.id,
      name: 'event-1.ics',
      ownerPrincipalId: attendee.principalId,
      ics,
      parsed: parseCalendarObject(ics),
      etag: 'etag-1',
      existing: null,
    });
    return calendar.id;
  }

  const inboxItemsFor = (user: User) =>
    dataSource
      .getRepository(SchedulingInboxItem)
      .findBy({ ownerPrincipalId: user.principalId });

  it('delivers a full CANCEL to every locally resolvable attendee and removes their copies', async () => {
    const ics = event({
      organizer: `mailto:${alice.email}`,
      attendees: [
        { address: `mailto:${bob.email}` },
        { address: `mailto:${carol.email}` },
      ],
    });
    const bobCalendarId = await fileAttendeeCopy(bob, ics);
    const carolCalendarId = await fileAttendeeCopy(carol, ics);

    await deliverOrganizerCancellation(dataSource, {
      tenant,
      uid: 'event-1',
      ics,
      organizerPrincipalId: alice.principalId,
    });

    for (const [attendee, calendarId] of [
      [bob, bobCalendarId],
      [carol, carolCalendarId],
    ] as const) {
      const items = await inboxItemsFor(attendee);
      expect(items).toHaveLength(1);
      expect(items[0]?.method).toBe('CANCEL');
      const participants = extractSchedulingParticipants(items[0]!.icsData);
      expect(participants.attendees.length).toBeGreaterThan(0);

      const remaining = await dataSource
        .getRepository(CalendarObject)
        .findBy({ calendarId, uid: 'event-1' });
      expect(remaining).toHaveLength(0);
    }
  });

  it('uses the same CANCEL message for every recipient (RFC 5546: a single message for all attendees)', async () => {
    const ics = event({
      organizer: `mailto:${alice.email}`,
      attendees: [
        { address: `mailto:${bob.email}` },
        { address: `mailto:${carol.email}` },
      ],
    });

    await deliverOrganizerCancellation(dataSource, {
      tenant,
      uid: 'event-1',
      ics,
      organizerPrincipalId: alice.principalId,
    });

    const bobItems = await inboxItemsFor(bob);
    const carolItems = await inboxItemsFor(carol);
    expect(bobItems[0]?.icsData).toBe(carolItems[0]?.icsData);
  });

  it('never delivers to the organizer, even if they list themselves as an attendee', async () => {
    const ics = event({
      organizer: `mailto:${alice.email}`,
      attendees: [
        { address: `mailto:${alice.email}` },
        { address: `mailto:${bob.email}` },
      ],
    });

    await deliverOrganizerCancellation(dataSource, {
      tenant,
      uid: 'event-1',
      ics,
      organizerPrincipalId: alice.principalId,
    });

    expect(await inboxItemsFor(alice)).toHaveLength(0);
    expect(await inboxItemsFor(bob)).toHaveLength(1);
  });

  it('does nothing for an event with no attendees at all', async () => {
    const ics = event({ organizer: `mailto:${alice.email}`, attendees: [] });

    await expect(
      deliverOrganizerCancellation(dataSource, {
        tenant,
        uid: 'event-1',
        ics,
        organizerPrincipalId: alice.principalId,
      }),
    ).resolves.toBeUndefined();

    expect(await dataSource.getRepository(SchedulingInboxItem).count()).toBe(0);
  });
});
