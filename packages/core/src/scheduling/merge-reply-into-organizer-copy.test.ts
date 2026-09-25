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
import { extractSchedulingParticipants } from './detect-scheduling-role.js';
import { mergeReplyIntoOrganizerCopy } from './merge-reply-into-organizer-copy.js';

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
  sequence?: number;
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

describe('mergeReplyIntoOrganizerCopy', () => {
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

  async function putOrganizerEvent(ics: string): Promise<CalendarObject> {
    const calendar = await createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: alice.principalId,
      name: 'work',
      initialization: DEFAULT_INIT,
    });
    const { object } = await saveCalendarObject(dataSource, {
      tenantId: tenant.id,
      calendarId: calendar.id,
      name: 'event.ics',
      ownerPrincipalId: alice.principalId,
      ics,
      parsed: parseCalendarObject(ics),
      etag: 'etag-1',
      existing: null,
    });
    return object;
  }

  async function icsOf(object: CalendarObject): Promise<string> {
    const content = await dataSource
      .getRepository(CalendarObjectContent)
      .findOneByOrFail({ calendarObjectId: object.id });
    return content.icsData;
  }

  it("updates only the replying attendee's PARTSTAT, leaving others untouched", async () => {
    const organizerObject = await putOrganizerEvent(
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [
          { address: `mailto:${bob.email}` },
          { address: `mailto:${carol.email}` },
        ],
      }),
    );

    await mergeReplyIntoOrganizerCopy(dataSource, {
      tenantId: tenant.id,
      uid: 'event-1',
      organizerPrincipalId: alice.principalId,
      attendeeAddress: `mailto:${bob.email}`,
      partstat: 'ACCEPTED',
    });

    const merged = await dataSource
      .getRepository(CalendarObject)
      .findOneByOrFail({ id: organizerObject.id });
    const participants = extractSchedulingParticipants(await icsOf(merged));
    expect(
      participants.attendees.find((a) => a.address === `mailto:${bob.email}`)
        ?.partstat,
    ).toBe('ACCEPTED');
    expect(
      participants.attendees.find((a) => a.address === `mailto:${carol.email}`)
        ?.partstat,
    ).toBe('NEEDS-ACTION');
  });

  it('does not change SEQUENCE', async () => {
    const organizerObject = await putOrganizerEvent(
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [{ address: `mailto:${bob.email}` }],
        sequence: 3,
      }),
    );

    await mergeReplyIntoOrganizerCopy(dataSource, {
      tenantId: tenant.id,
      uid: 'event-1',
      organizerPrincipalId: alice.principalId,
      attendeeAddress: `mailto:${bob.email}`,
      partstat: 'ACCEPTED',
    });

    const merged = await dataSource
      .getRepository(CalendarObject)
      .findOneByOrFail({ id: organizerObject.id });
    expect(await icsOf(merged)).toContain('SEQUENCE:3');
  });

  it('does not deliver a new REQUEST to other attendees (no delivery loop)', async () => {
    await putOrganizerEvent(
      event({
        organizer: `mailto:${alice.email}`,
        attendees: [
          { address: `mailto:${bob.email}` },
          { address: `mailto:${carol.email}` },
        ],
      }),
    );

    await mergeReplyIntoOrganizerCopy(dataSource, {
      tenantId: tenant.id,
      uid: 'event-1',
      organizerPrincipalId: alice.principalId,
      attendeeAddress: `mailto:${bob.email}`,
      partstat: 'ACCEPTED',
    });

    expect(await dataSource.getRepository(SchedulingInboxItem).count()).toBe(0);
  });

  it('is a no-op when the organizer has no matching object', async () => {
    await expect(
      mergeReplyIntoOrganizerCopy(dataSource, {
        tenantId: tenant.id,
        uid: 'no-such-event',
        organizerPrincipalId: alice.principalId,
        attendeeAddress: `mailto:${bob.email}`,
        partstat: 'ACCEPTED',
      }),
    ).resolves.toBeUndefined();
  });
});
