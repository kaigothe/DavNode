import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCalendarCollection } from '../caldav/create-calendar.js';
import { saveCalendarObject } from '../caldav/calendar-object-writes.js';
import { parseCalendarObject } from '../caldav/icalendar-parser.js';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarObject,
  CalendarObjectContent,
  SchedulingInboxItem,
  Tenant,
  User,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { UserService } from '../services/user.service.js';
import { deliverOrganizerInvites } from './deliver-organizer-invites.js';
import { extractSchedulingParticipants } from './detect-scheduling-role.js';

const DEFAULT_INIT = {
  displayName: null,
  description: null,
  timezone: null,
  supportedComponentSet: ['VEVENT' as const],
  deadProperties: [],
};

/** An organizer/attendee scheduling object resource. */
function event(options: {
  uid?: string;
  organizer: string;
  attendees: { address: string; partstat?: string }[];
  dtstart?: string;
  sequence?: number;
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
  ];
  if (options.sequence !== undefined) {
    lines.push(`SEQUENCE:${options.sequence}`);
  }
  lines.push(`ORGANIZER:${options.organizer}`);
  for (const attendee of options.attendees) {
    lines.push(
      `ATTENDEE;PARTSTAT=${attendee.partstat ?? 'NEEDS-ACTION'}:${attendee.address}`,
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR', '');
  return lines.join('\r\n');
}

describe('deliverOrganizerInvites', () => {
  let dataSource: DataSource;
  let tenant: Tenant;

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
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  /** Creates a user with a first calendar, so `defaultCalendarId` is set — reloads the row afterward, since `createCalendarCollection` sets it as a side effect. */
  async function newUserWithCalendar(
    username: string,
    email: string,
  ): Promise<User> {
    const user = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username,
      email,
      password: `pw-${username}`,
    });
    await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: user.principalId,
      name: 'default',
      initialization: DEFAULT_INIT,
    });
    return dataSource.getRepository(User).findOneByOrFail({ id: user.id });
  }

  async function newUserWithoutCalendar(
    username: string,
    email: string,
  ): Promise<User> {
    return new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username,
      email,
      password: `pw-${username}`,
    });
  }

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

  it('delivers a REQUEST and auto-files a NEEDS-ACTION copy for each local attendee of a brand-new event', async () => {
    const alice = await newUserWithCalendar('alice', 'alice@example.com');
    const bob = await newUserWithCalendar('bob', 'bob@example.com');
    const carol = await newUserWithCalendar('carol', 'carol@example.com');
    const ics = event({
      organizer: `mailto:${alice.email}`,
      attendees: [
        { address: `mailto:${bob.email}` },
        { address: `mailto:${carol.email}` },
      ],
    });

    await deliverOrganizerInvites(dataSource, {
      tenant,
      uid: 'event-1',
      newIcs: ics,
      oldIcs: null,
      organizerPrincipalId: alice.principalId,
    });

    for (const attendee of [bob, carol]) {
      const items = await inboxItemsFor(attendee);
      expect(items).toHaveLength(1);
      expect(items[0]?.method).toBe('REQUEST');
      expect(items[0]?.uid).toBe('event-1');

      const copy = await copyFor(attendee, 'event-1');
      expect(copy).not.toBeNull();
      const copyIcs = await icsOf(copy!);
      const participants = extractSchedulingParticipants(copyIcs);
      const ownAttendee = participants.attendees.find(
        (a) => a.address.toLowerCase() === `mailto:${attendee.email}`,
      );
      expect(ownAttendee?.partstat).toBe('NEEDS-ACTION');
    }
    // The organizer never gets an inbox item or a copy of their own event.
    expect(await inboxItemsFor(alice)).toHaveLength(0);
  });

  it('does not deliver to the organizer even if they list themselves as an ATTENDEE', async () => {
    const alice = await newUserWithCalendar('alice', 'alice@example.com');
    const bob = await newUserWithCalendar('bob', 'bob@example.com');
    const ics = event({
      organizer: `mailto:${alice.email}`,
      attendees: [
        { address: `mailto:${alice.email}` },
        { address: `mailto:${bob.email}` },
      ],
    });

    await deliverOrganizerInvites(dataSource, {
      tenant,
      uid: 'event-1',
      newIcs: ics,
      oldIcs: null,
      organizerPrincipalId: alice.principalId,
    });

    expect(await inboxItemsFor(alice)).toHaveLength(0);
    expect(await copyFor(alice, 'event-1')).toBeNull();
    expect(await inboxItemsFor(bob)).toHaveLength(1);
  });

  it('sends CANCEL to a removed attendee and deletes their copy, leaving the remaining attendee alone', async () => {
    const alice = await newUserWithCalendar('alice', 'alice@example.com');
    const bob = await newUserWithCalendar('bob', 'bob@example.com');
    const carol = await newUserWithCalendar('carol', 'carol@example.com');
    const oldIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [
        { address: `mailto:${bob.email}` },
        { address: `mailto:${carol.email}` },
      ],
    });
    await deliverOrganizerInvites(dataSource, {
      tenant,
      uid: 'event-1',
      newIcs: oldIcs,
      oldIcs: null,
      organizerPrincipalId: alice.principalId,
    });
    const newIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}` }],
      sequence: 1,
    });

    await deliverOrganizerInvites(dataSource, {
      tenant,
      uid: 'event-1',
      newIcs,
      oldIcs,
      organizerPrincipalId: alice.principalId,
    });

    const carolItems = await inboxItemsFor(carol);
    expect(carolItems).toHaveLength(2); // the initial REQUEST, then the CANCEL
    expect(carolItems[1]?.method).toBe('CANCEL');
    expect(await copyFor(carol, 'event-1')).toBeNull();

    expect(await copyFor(bob, 'event-1')).not.toBeNull();
    const bobItems = await inboxItemsFor(bob);
    expect(bobItems).toHaveLength(2); // the initial REQUEST, then the updated one
    expect(bobItems[1]?.method).toBe('REQUEST');
  });

  it("preserves an already-accepted attendee's own PARTSTAT across an update (e.g. a time change)", async () => {
    const alice = await newUserWithCalendar('alice', 'alice@example.com');
    const bob = await newUserWithCalendar('bob', 'bob@example.com');
    const oldIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}` }],
    });
    await deliverOrganizerInvites(dataSource, {
      tenant,
      uid: 'event-1',
      newIcs: oldIcs,
      oldIcs: null,
      organizerPrincipalId: alice.principalId,
    });
    // Bob accepts on his own copy, as the (not-yet-built) attendee-reply
    // workflow eventually would.
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

    const newIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}` }], // organizer's own copy still shows NEEDS-ACTION
      dtstart: '20261001T140000Z',
      sequence: 1,
    });
    await deliverOrganizerInvites(dataSource, {
      tenant,
      uid: 'event-1',
      newIcs,
      oldIcs,
      organizerPrincipalId: alice.principalId,
    });

    const updatedCopy = await copyFor(bob, 'event-1');
    const updatedIcs = await icsOf(updatedCopy!);
    const participants = extractSchedulingParticipants(updatedIcs);
    expect(participants.attendees[0]?.partstat).toBe('ACCEPTED');
    expect(updatedIcs).toContain('DTSTART:20261001T140000Z');
  });

  it('does nothing (no error, no rows) for an event with only external attendees', async () => {
    const alice = await newUserWithCalendar('alice', 'alice@example.com');
    const ics = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: 'mailto:stranger@elsewhere.example.com' }],
    });

    await expect(
      deliverOrganizerInvites(dataSource, {
        tenant,
        uid: 'event-1',
        newIcs: ics,
        oldIcs: null,
        organizerPrincipalId: alice.principalId,
      }),
    ).resolves.toBeUndefined();

    expect(await dataSource.getRepository(SchedulingInboxItem).count()).toBe(0);
  });

  it('delivers the REQUEST but skips auto-filing for an attendee with no default calendar yet', async () => {
    const alice = await newUserWithCalendar('alice', 'alice@example.com');
    const bob = await newUserWithoutCalendar('bob', 'bob@example.com');
    const ics = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}` }],
    });

    await deliverOrganizerInvites(dataSource, {
      tenant,
      uid: 'event-1',
      newIcs: ics,
      oldIcs: null,
      organizerPrincipalId: alice.principalId,
    });

    expect(await inboxItemsFor(bob)).toHaveLength(1);
    expect(await dataSource.getRepository(CalendarObject).count()).toBe(0);
  });
});
