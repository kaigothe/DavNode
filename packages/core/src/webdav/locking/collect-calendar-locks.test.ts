import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  CalendarLock,
  CalendarObject,
  CalendarObjectLock,
  Principal,
  Tenant,
} from '../../entities/index.js';
import { ALL_MIGRATIONS } from '../../migrations/sqlite/index.js';
import { getEffectiveCalendarLocks } from './collect-locks.js';

describe('getEffectiveCalendarLocks', () => {
  let dataSource: DataSource;
  let principal: Principal;
  let calendar: CalendarCollection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    const tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    principal = await dataSource
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
        tenantId: principal?.tenantId ?? '',
        ownerPrincipalId: principal?.id ?? '',
        name,
        displayName: name,
      }),
    );
  }

  function calendarObject(
    name: string,
    parent: CalendarCollection = calendar,
  ): Promise<CalendarObject> {
    return dataSource.getRepository(CalendarObject).save(
      dataSource.getRepository(CalendarObject).create({
        tenantId: parent.tenantId,
        calendarId: parent.id,
        name,
        uid: `uid-${name}`,
        etag: 'etag-1',
        componentType: 'VEVENT',
        ownerPrincipalId: principal.id,
        dtstart: new Date('2026-09-24T10:00:00Z'),
      }),
    );
  }

  let nextTokenSuffix = 1;
  function nextToken(): string {
    const suffix = String(nextTokenSuffix++).padStart(12, '0');
    return `urn:uuid:00000000-0000-0000-0000-${suffix}`;
  }

  function calendarLock(
    overrides: Partial<{
      scope: 'exclusive' | 'shared';
      depth: 'zero' | 'infinity';
      expiresAt: Date | null;
      calendarId: string;
    }> = {},
  ): Promise<CalendarLock> {
    return dataSource.getRepository(CalendarLock).save(
      dataSource.getRepository(CalendarLock).create({
        calendarId: overrides.calendarId ?? calendar.id,
        principalId: principal.id,
        token: nextToken(),
        scope: overrides.scope ?? 'exclusive',
        depth: overrides.depth ?? 'infinity',
        timeoutSeconds: null,
        expiresAt: overrides.expiresAt ?? null,
        ownerInfo: null,
      }),
    );
  }

  function objectLock(
    calendarObjectId: string,
    overrides: Partial<{ expiresAt: Date | null }> = {},
  ): Promise<CalendarObjectLock> {
    return dataSource.getRepository(CalendarObjectLock).save(
      dataSource.getRepository(CalendarObjectLock).create({
        calendarObjectId,
        principalId: principal.id,
        token: nextToken(),
        scope: 'exclusive',
        timeoutSeconds: null,
        expiresAt: overrides.expiresAt ?? null,
        ownerInfo: null,
      }),
    );
  }

  const effective = (resource: CalendarCollection | CalendarObject) =>
    dataSource.manager.transaction((manager) =>
      getEffectiveCalendarLocks(manager, resource),
    );

  it('a depth:infinity lock on the calendar applies to an object inside it', async () => {
    const lock = await calendarLock({ depth: 'infinity' });
    const event = await calendarObject('event.ics');

    expect(await effective(event)).toEqual([
      expect.objectContaining({
        id: lock.id,
        inherited: true,
        inheritedFrom: calendar.id,
      }),
    ]);
  });

  it('a depth:zero lock on the calendar does not apply to its objects', async () => {
    await calendarLock({ depth: 'zero' });
    const event = await calendarObject('event.ics');

    expect(await effective(event)).toEqual([]);
  });

  it('a depth:zero lock still applies directly to the calendar it is on', async () => {
    const lock = await calendarLock({ depth: 'zero' });

    expect(await effective(calendar)).toEqual([
      expect.objectContaining({
        id: lock.id,
        inherited: false,
        inheritedFrom: null,
      }),
    ]);
  });

  it('an expired lock is not returned', async () => {
    const event = await calendarObject('event.ics');
    await objectLock(event.id, { expiresAt: new Date(Date.now() - 1000) });
    await calendarLock({ expiresAt: new Date(Date.now() - 1000) });

    expect(await effective(event)).toEqual([]);
    expect(await effective(calendar)).toEqual([]);
  });

  it("combines an object's own lock with an inherited calendar lock, own first", async () => {
    const event = await calendarObject('event.ics');
    const own = await objectLock(event.id);
    const ancestor = await calendarLock({ depth: 'infinity' });

    expect(await effective(event)).toEqual([
      expect.objectContaining({
        id: own.id,
        inherited: false,
        inheritedFrom: null,
      }),
      expect.objectContaining({
        id: ancestor.id,
        inherited: true,
        inheritedFrom: calendar.id,
      }),
    ]);
  });

  it("does not see another calendar's locks or another object's lock", async () => {
    const other = await newCalendar('private');
    await calendarLock({ calendarId: other.id });
    const event = await calendarObject('event.ics');
    const sibling = await calendarObject('sibling.ics');
    await objectLock(sibling.id);

    expect(await effective(event)).toEqual([]);
    expect(await effective(calendar)).toEqual([]);
  });
});
