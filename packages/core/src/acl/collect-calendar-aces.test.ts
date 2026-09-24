import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarAce,
  CalendarCollection,
  CalendarObject,
  CalendarObjectAce,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { collectCalendarAces } from './collect-aces.js';

describe('collectCalendarAces', () => {
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
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: principal.id,
        name: 'work',
        displayName: 'Work',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function calendarObject(name: string): Promise<CalendarObject> {
    return dataSource.getRepository(CalendarObject).save(
      dataSource.getRepository(CalendarObject).create({
        tenantId: calendar.tenantId,
        calendarId: calendar.id,
        name,
        uid: `uid-${name}`,
        etag: 'etag-1',
        componentType: 'VEVENT',
        ownerPrincipalId: principal.id,
        dtstart: new Date('2026-09-24T10:00:00Z'),
      }),
    );
  }

  function calendarAce(position: number): Promise<CalendarAce> {
    return dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position,
      }),
    );
  }

  function objectAce(
    calendarObjectId: string,
    position: number,
  ): Promise<CalendarObjectAce> {
    return dataSource.getRepository(CalendarObjectAce).save(
      dataSource.getRepository(CalendarObjectAce).create({
        calendarObjectId,
        principalId: principal.id,
        privilege: 'write-content',
        grantDeny: 'grant',
        position,
      }),
    );
  }

  it("a calendar's own ACEs come back in position order, marked not inherited", async () => {
    const second = await calendarAce(1);
    const first = await calendarAce(0);

    const result = await dataSource.manager.transaction((manager) =>
      collectCalendarAces(manager, calendar),
    );

    expect(result).toEqual([
      expect.objectContaining({ id: first.id, inherited: false }),
      expect.objectContaining({ id: second.id, inherited: false }),
    ]);
  });

  it('an object without its own ACEs gets exactly its calendar ACEs, marked inherited', async () => {
    const ace = await calendarAce(0);
    const event = await calendarObject('event.ics');

    const result = await dataSource.manager.transaction((manager) =>
      collectCalendarAces(manager, event),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: ace.id,
        inherited: true,
        inheritedFrom: calendar.id,
      }),
    ]);
  });

  it('an object with its own ACEs gets both: its own first, then its calendar', async () => {
    const ace = await calendarAce(0);
    const event = await calendarObject('event.ics');
    const own = await objectAce(event.id, 0);

    const result = await dataSource.manager.transaction((manager) =>
      collectCalendarAces(manager, event),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: own.id,
        inherited: false,
        inheritedFrom: null,
      }),
      expect.objectContaining({
        id: ace.id,
        inherited: true,
        inheritedFrom: calendar.id,
      }),
    ]);
  });

  it("does not pick up another calendar's or another object's ACEs", async () => {
    const other = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: calendar.tenantId,
        ownerPrincipalId: principal.id,
        name: 'private',
        displayName: 'Private',
      }),
    );
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: other.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        position: 0,
      }),
    );
    const event = await calendarObject('event.ics');
    const sibling = await calendarObject('sibling.ics');
    await objectAce(sibling.id, 0);

    const result = await dataSource.manager.transaction((manager) =>
      collectCalendarAces(manager, event),
    );

    expect(result).toEqual([]);
  });

  it('keeps read-free-busy ACEs, which only the calendar tables can store', async () => {
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId: principal.id,
        privilege: 'read-free-busy',
        grantDeny: 'grant',
        position: 0,
      }),
    );

    const result = await dataSource.manager.transaction((manager) =>
      collectCalendarAces(manager, calendar),
    );

    expect(result.map((ace) => ace.privilege)).toEqual(['read-free-busy']);
  });
});
