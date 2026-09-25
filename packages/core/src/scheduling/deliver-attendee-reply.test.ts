import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveCalendarObject } from '../caldav/calendar-object-writes.js';
import { createCalendarCollection } from '../caldav/create-calendar.js';
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
import { calendarUserAddressesFor } from './scheduling-principal-properties.js';
import { deliverAttendeeReply } from './deliver-attendee-reply.js';
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

describe('deliverAttendeeReply', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;

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
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function putOrganizerEvent(ics: string): Promise<void> {
    const calendar = await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: alice.principalId,
      name: 'work',
      initialization: DEFAULT_INIT,
    });
    await saveCalendarObject(dataSource, {
      tenantId: tenant.id,
      calendarId: calendar.id,
      name: 'event.ics',
      ownerPrincipalId: alice.principalId,
      ics,
      parsed: parseCalendarObject(ics),
      etag: 'etag-1',
      existing: null,
    });
  }

  const bobAddresses = () => calendarUserAddressesFor(bob, tenant);

  it("delivers a REPLY to the organizer's inbox when PARTSTAT actually changed", async () => {
    await putOrganizerEvent(
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );
    const oldIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}`, partstat: 'NEEDS-ACTION' }],
    });
    const newIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}`, partstat: 'ACCEPTED' }],
    });

    await deliverAttendeeReply(dataSource, {
      tenant,
      uid: 'event-1',
      oldIcs,
      newIcs,
      writerAddresses: bobAddresses(),
    });

    const items = await dataSource
      .getRepository(SchedulingInboxItem)
      .findBy({ ownerPrincipalId: alice.principalId });
    expect(items).toHaveLength(1);
    expect(items[0]?.method).toBe('REPLY');
    const participants = extractSchedulingParticipants(items[0]!.icsData);
    expect(participants.attendees).toHaveLength(1);
    expect(participants.attendees[0]?.partstat).toBe('ACCEPTED');
  });

  it('does not deliver anything when PARTSTAT is unchanged (e.g. only another field edited)', async () => {
    await putOrganizerEvent(
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );
    const oldIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}`, partstat: 'NEEDS-ACTION' }],
    });
    const newIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}`, partstat: 'NEEDS-ACTION' }],
      extra: ['SUMMARY:Planning (updated notes)'],
    });

    await deliverAttendeeReply(dataSource, {
      tenant,
      uid: 'event-1',
      oldIcs,
      newIcs,
      writerAddresses: bobAddresses(),
    });

    expect(await dataSource.getRepository(SchedulingInboxItem).count()).toBe(0);
  });

  it('delivers nothing (no error) when the organizer is not locally resolvable', async () => {
    const oldIcs = event({
      organizer: 'mailto:external-organizer@elsewhere.example.com',
      attendees: [{ address: `mailto:${bob.email}`, partstat: 'NEEDS-ACTION' }],
    });
    const newIcs = event({
      organizer: 'mailto:external-organizer@elsewhere.example.com',
      attendees: [{ address: `mailto:${bob.email}`, partstat: 'ACCEPTED' }],
    });

    await expect(
      deliverAttendeeReply(dataSource, {
        tenant,
        uid: 'event-1',
        oldIcs,
        newIcs,
        writerAddresses: bobAddresses(),
      }),
    ).resolves.toBeUndefined();

    expect(await dataSource.getRepository(SchedulingInboxItem).count()).toBe(0);
  });

  it("merges the reply into the organizer's own copy", async () => {
    await putOrganizerEvent(
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
      }),
    );
    const oldIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}`, partstat: 'NEEDS-ACTION' }],
    });
    const newIcs = event({
      organizer: `mailto:${alice.email}`,
      attendees: [{ address: `mailto:${bob.email}`, partstat: 'DECLINED' }],
    });

    await deliverAttendeeReply(dataSource, {
      tenant,
      uid: 'event-1',
      oldIcs,
      newIcs,
      writerAddresses: bobAddresses(),
    });

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
});
