import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarChange,
  CalendarCollection,
  CalendarObject,
  CalendarObjectAce,
  CalendarObjectContent,
  CalendarObjectLock,
  CalendarObjectProperty,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  CalendarObjectChangedError,
  CalendarUidConflictError,
  deleteCalendarObject,
  saveCalendarObject,
} from './calendar-object-writes.js';
import { parseCalendarObject } from './icalendar-parser.js';

function etagOf(ics: string): string {
  return createHash('sha256').update(ics, 'utf8').digest('hex');
}

/** A single-event calendar object. */
function event(uid: string, start = '20260924T100000Z', summary = 'Meeting') {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    `DTSTART:${start}`,
    `SUMMARY:${summary}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** A weekly series whose second instance is moved by an override. */
const SERIES = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//DavNode//Test//EN',
  'BEGIN:VEVENT',
  'UID:series-1',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260105T090000Z',
  'DTEND:20260105T100000Z',
  'RRULE:FREQ=WEEKLY;COUNT=4',
  'SUMMARY:Standup',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:series-1',
  'DTSTAMP:20260101T000000Z',
  'RECURRENCE-ID:20260112T090000Z',
  'DTSTART:20260112T140000Z',
  'DTEND:20260112T150000Z',
  'SUMMARY:Standup (moved)',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

describe('calendar object writes', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let owner: Principal;
  let calendar: CalendarCollection;

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
    owner = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    calendar = await newCalendar('work');
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function newCalendar(name: string): Promise<CalendarCollection> {
    return dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        name,
        displayName: name,
      }),
    );
  }

  function save(
    name: string,
    ics: string,
    options: {
      existing?: CalendarObject | null;
      expectedEtag?: string;
      calendarId?: string;
    } = {},
  ) {
    return saveCalendarObject(dataSource, {
      tenantId: tenant.id,
      calendarId: options.calendarId ?? calendar.id,
      name,
      ownerPrincipalId: owner.id,
      ics,
      parsed: parseCalendarObject(ics),
      etag: etagOf(ics),
      existing: options.existing ?? null,
      expectedEtag: options.expectedEtag,
    });
  }

  const objects = () => dataSource.getRepository(CalendarObject);
  const reloadCalendar = () =>
    dataSource
      .getRepository(CalendarCollection)
      .findOneByOrFail({ id: calendar.id });

  describe('saveCalendarObject', () => {
    it('creates an object with its content, index, owner ACE and change record', async () => {
      const ics = event('uid-1');

      const { created, object } = await save('event.ics', ics);

      expect(created).toBe(true);
      const stored = await objects().findOneByOrFail({ id: object.id });
      expect(stored).toMatchObject({
        tenantId: tenant.id,
        calendarId: calendar.id,
        name: 'event.ics',
        uid: 'uid-1',
        etag: etagOf(ics),
        componentType: 'VEVENT',
        ownerPrincipalId: owner.id,
        isAllDay: false,
      });
      expect(stored.dtstart.toISOString()).toBe('2026-09-24T10:00:00.000Z');
      expect(stored.dtend?.toISOString()).toBe('2026-09-24T10:00:00.000Z');
      expect(stored.recurrenceSpanEnd?.toISOString()).toBe(
        '2026-09-24T10:00:00.000Z',
      );

      const content = await dataSource
        .getRepository(CalendarObjectContent)
        .findOneByOrFail({ calendarObjectId: object.id });
      expect(content.icsData).toBe(ics);

      expect(
        await dataSource
          .getRepository(CalendarObjectAce)
          .findBy({ calendarObjectId: object.id }),
      ).toEqual([
        expect.objectContaining({
          principalId: owner.id,
          privilege: 'all',
          grantDeny: 'grant',
          protected: true,
        }),
      ]);

      expect((await reloadCalendar()).syncSeq).toBe(1);
      expect(
        await dataSource
          .getRepository(CalendarChange)
          .findBy({ calendarId: calendar.id }),
      ).toEqual([
        expect.objectContaining({ seq: 1, name: 'event.ics', action: 'added' }),
      ]);
    });

    it('stores the submitted text verbatim, line endings and all', async () => {
      const ics = event('uid-1', '20260924T100000Z', 'Café ☕ 😀').replace(
        /\r\n/g,
        '\n',
      );

      const { object } = await save('event.ics', ics);

      const content = await dataSource
        .getRepository(CalendarObjectContent)
        .findOneByOrFail({ calendarObjectId: object.id });
      expect(content.icsData).toBe(ics);
    });

    it('stores a series with an override as one object, indexed over the whole series', async () => {
      const { object } = await save('series.ics', SERIES);

      expect(await objects().count()).toBe(1);
      const stored = await objects().findOneByOrFail({ id: object.id });
      expect(stored.uid).toBe('series-1');
      expect(stored.dtstart.toISOString()).toBe('2026-01-05T09:00:00.000Z');
      // The last of four weekly instances ends at 10:00 on 26 Jan.
      expect(stored.recurrenceSpanEnd?.toISOString()).toBe(
        '2026-01-26T10:00:00.000Z',
      );
    });

    it('overwrites an object in place: new content and ETag, re-derived index, one more change', async () => {
      const first = event('uid-1', '20260924T100000Z');
      const { object } = await save('event.ics', first);
      const second = event('uid-1', '20261101T080000Z', 'Moved');

      const result = await save('event.ics', second, { existing: object });

      expect(result.created).toBe(false);
      expect(result.object.id).toBe(object.id);
      const stored = await objects().findOneByOrFail({ id: object.id });
      expect(stored.etag).toBe(etagOf(second));
      expect(stored.dtstart.toISOString()).toBe('2026-11-01T08:00:00.000Z');
      expect(stored.recurrenceSpanEnd?.toISOString()).toBe(
        '2026-11-01T08:00:00.000Z',
      );
      expect(
        (
          await dataSource
            .getRepository(CalendarObjectContent)
            .findOneByOrFail({ calendarObjectId: object.id })
        ).icsData,
      ).toBe(second);
      expect(await objects().count()).toBe(1);
      // No second owner ACE for an overwrite.
      expect(await dataSource.getRepository(CalendarObjectAce).count()).toBe(1);

      const changes = await dataSource
        .getRepository(CalendarChange)
        .find({ order: { seq: 'ASC' } });
      expect(changes.map((c) => [c.seq, c.name, c.action])).toEqual([
        [1, 'event.ics', 'added'],
        [2, 'event.ics', 'modified'],
      ]);
    });

    it('overwrites when the expected ETag still matches', async () => {
      const first = event('uid-1');
      const { object } = await save('event.ics', first);

      const result = await save(
        'event.ics',
        event('uid-1', '20261101T080000Z'),
        {
          existing: object,
          expectedEtag: etagOf(first),
        },
      );

      expect(result.created).toBe(false);
    });

    it('refuses a guarded overwrite whose ETag has moved on, changing nothing', async () => {
      const first = event('uid-1');
      const { object } = await save('event.ics', first);
      const newer = event('uid-1', '20261101T080000Z', 'Newer');
      await save('event.ics', newer, { existing: object });
      const seqBefore = (await reloadCalendar()).syncSeq;

      await expect(
        save('event.ics', event('uid-1', '20270101T080000Z', 'Stale'), {
          existing: object,
          expectedEtag: etagOf(first),
        }),
      ).rejects.toBeInstanceOf(CalendarObjectChangedError);

      const stored = await objects().findOneByOrFail({ id: object.id });
      expect(stored.etag).toBe(etagOf(newer));
      expect(
        (
          await dataSource
            .getRepository(CalendarObjectContent)
            .findOneByOrFail({ calendarObjectId: object.id })
        ).icsData,
      ).toBe(newer);
      expect((await reloadCalendar()).syncSeq).toBe(seqBefore);
    });

    it('refuses an overwrite of an object that was deleted in the meantime', async () => {
      const { object } = await save('event.ics', event('uid-1'));
      await deleteCalendarObject(dataSource, {
        calendarId: calendar.id,
        object,
      });

      await expect(
        save('event.ics', event('uid-1', '20261101T080000Z'), {
          existing: object,
        }),
      ).rejects.toBeInstanceOf(CalendarObjectChangedError);
      expect(await objects().count()).toBe(0);
    });

    it('refuses a UID that another object of the calendar already uses, naming that object', async () => {
      await save('first.ics', event('shared-uid'));
      const seqBefore = (await reloadCalendar()).syncSeq;

      const failure = await save('second.ics', event('shared-uid')).catch(
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(CalendarUidConflictError);
      expect((failure as CalendarUidConflictError).conflictingName).toBe(
        'first.ics',
      );
      expect(await objects().count()).toBe(1);
      expect(await dataSource.getRepository(CalendarObjectAce).count()).toBe(1);
      expect((await reloadCalendar()).syncSeq).toBe(seqBefore);
    });

    it('refuses to give an existing object a different UID', async () => {
      const { object } = await save('event.ics', event('uid-1'));

      const failure = await save('event.ics', event('uid-2'), {
        existing: object,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(CalendarUidConflictError);
      expect((failure as CalendarUidConflictError).conflictingName).toBe(
        'event.ics',
      );
      expect((await objects().findOneByOrFail({ id: object.id })).uid).toBe(
        'uid-1',
      );
    });

    it('allows the same UID in different calendars', async () => {
      const other = await newCalendar('private');
      await save('event.ics', event('shared-uid'));

      const result = await save('event.ics', event('shared-uid'), {
        calendarId: other.id,
      });

      expect(result.created).toBe(true);
      expect(await objects().count()).toBe(2);
    });

    it('reports a URL taken by a concurrent create as changed, not as a database error', async () => {
      await save('event.ics', event('uid-1'));

      // The caller saw no object at this URL, but one exists now: same UID...
      await expect(save('event.ics', event('uid-1'))).rejects.toBeInstanceOf(
        CalendarObjectChangedError,
      );
      // ...or a different one, which only the unique index on the name catches.
      await expect(save('event.ics', event('uid-2'))).rejects.toBeInstanceOf(
        CalendarObjectChangedError,
      );
      expect(await objects().count()).toBe(1);
    });

    it('rolls the whole write back when a later step fails', async () => {
      // A change record already occupying the sequence number the write
      // will take makes the last step of the transaction fail.
      await dataSource.getRepository(CalendarChange).save(
        dataSource.getRepository(CalendarChange).create({
          calendarId: calendar.id,
          seq: 1,
          name: 'other.ics',
          action: 'added',
        }),
      );

      await expect(save('event.ics', event('uid-1'))).rejects.toThrow();

      expect(await objects().count()).toBe(0);
      expect(
        await dataSource.getRepository(CalendarObjectContent).count(),
      ).toBe(0);
      expect(await dataSource.getRepository(CalendarObjectAce).count()).toBe(0);
      expect((await reloadCalendar()).syncSeq).toBe(0);
    });
  });

  describe('deleteCalendarObject', () => {
    it('removes the object with its content, properties, ACEs and locks, and records the deletion', async () => {
      const { object } = await save('event.ics', event('uid-1'));
      const keep = (await save('keep.ics', event('uid-2'))).object;
      await dataSource.getRepository(CalendarObjectProperty).save(
        dataSource.getRepository(CalendarObjectProperty).create({
          calendarObjectId: object.id,
          namespace: 'urn:example',
          name: 'note',
          value: 'x',
        }),
      );
      await dataSource.getRepository(CalendarObjectLock).save(
        dataSource.getRepository(CalendarObjectLock).create({
          calendarObjectId: object.id,
          principalId: owner.id,
          token: 'urn:uuid:11111111-1111-1111-1111-111111111111',
          scope: 'exclusive',
          timeoutSeconds: null,
          expiresAt: null,
          ownerInfo: null,
        }),
      );

      const deleted = await deleteCalendarObject(dataSource, {
        calendarId: calendar.id,
        object,
      });

      expect(deleted).toBe(true);
      expect(await objects().findBy({ id: object.id })).toEqual([]);
      for (const entity of [
        CalendarObjectContent,
        CalendarObjectProperty,
        CalendarObjectAce,
        CalendarObjectLock,
      ]) {
        expect(
          await dataSource
            .getRepository(entity)
            .findBy({ calendarObjectId: object.id }),
        ).toEqual([]);
      }
      // The other object is untouched.
      expect(await objects().findBy({ id: keep.id })).toHaveLength(1);
      expect(
        await dataSource
          .getRepository(CalendarObjectContent)
          .findBy({ calendarObjectId: keep.id }),
      ).toHaveLength(1);

      const last = await dataSource
        .getRepository(CalendarChange)
        .findOneOrFail({
          where: { calendarId: calendar.id },
          order: { seq: 'DESC' },
        });
      expect(last).toMatchObject({
        seq: 3,
        name: 'event.ics',
        action: 'deleted',
      });
    });

    it('deletes when the expected ETag matches and returns false, changing nothing, when it does not', async () => {
      const ics = event('uid-1');
      const { object } = await save('event.ics', ics);
      const seqBefore = (await reloadCalendar()).syncSeq;

      expect(
        await deleteCalendarObject(dataSource, {
          calendarId: calendar.id,
          object,
          expectedEtag: 'not-the-etag',
        }),
      ).toBe(false);
      expect(await objects().count()).toBe(1);
      expect(
        await dataSource
          .getRepository(CalendarObjectContent)
          .findBy({ calendarObjectId: object.id }),
      ).toHaveLength(1);
      expect(await dataSource.getRepository(CalendarObjectAce).count()).toBe(1);
      expect((await reloadCalendar()).syncSeq).toBe(seqBefore);

      expect(
        await deleteCalendarObject(dataSource, {
          calendarId: calendar.id,
          object,
          expectedEtag: etagOf(ics),
        }),
      ).toBe(true);
      expect(await objects().count()).toBe(0);
    });

    it('returns false for an object that is already gone', async () => {
      const { object } = await save('event.ics', event('uid-1'));
      await deleteCalendarObject(dataSource, {
        calendarId: calendar.id,
        object,
      });
      const seqBefore = (await reloadCalendar()).syncSeq;

      expect(
        await deleteCalendarObject(dataSource, {
          calendarId: calendar.id,
          object,
        }),
      ).toBe(false);
      expect((await reloadCalendar()).syncSeq).toBe(seqBefore);
    });
  });
});
