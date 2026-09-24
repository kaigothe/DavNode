import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  CalendarObject,
  CalendarObjectAce,
  Principal,
  Tenant,
} from './index.js';

describe('CalendarObjectAce entity', () => {
  let dataSource: DataSource;
  let calendarObject: CalendarObject;
  let principal: Principal;

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
    const calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: principal.id,
        name: 'personal',
        displayName: 'Personal',
      }),
    );
    calendarObject = await dataSource.getRepository(CalendarObject).save(
      dataSource.getRepository(CalendarObject).create({
        tenantId: tenant.id,
        calendarId: calendar.id,
        name: 'event.ics',
        uid: 'uid-1',
        etag: 'etag-1',
        componentType: 'VEVENT',
        ownerPrincipalId: principal.id,
        dtstart: new Date('2026-09-24T10:00:00Z'),
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists an ACE with its privilege and grant/deny value', async () => {
    const repository = dataSource.getRepository(CalendarObjectAce);
    const ace = await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 0,
      }),
    );

    const found = await repository.findOneByOrFail({ id: ace.id });
    expect(found.privilege).toBe('read');
    expect(found.grantDeny).toBe('grant');
    expect(found.protected).toBe(false);
  });

  it('allows several ACEs on the same calendar object with distinct positions, queryable in order', async () => {
    const repository = dataSource.getRepository(CalendarObjectAce);
    await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        privilege: 'write-acl',
        grantDeny: 'deny',
        position: 2,
      }),
    );
    await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        position: 0,
        protected: true,
      }),
    );
    await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const ordered = await repository.find({
      where: { calendarObjectId: calendarObject.id },
      order: { position: 'ASC' },
    });

    expect(ordered.map((ace) => ace.privilege)).toEqual([
      'all',
      'read',
      'write-acl',
    ]);
  });

  it('distinguishes protected ACEs from regular ones via the protected flag', async () => {
    const repository = dataSource.getRepository(CalendarObjectAce);
    await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        position: 0,
        protected: true,
      }),
    );
    await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const protectedAces = await repository.findBy({
      calendarObjectId: calendarObject.id,
      protected: true,
    });
    const regularAces = await repository.findBy({
      calendarObjectId: calendarObject.id,
      protected: false,
    });

    expect(protectedAces).toHaveLength(1);
    expect(protectedAces[0]?.privilege).toBe('all');
    expect(regularAces).toHaveLength(1);
    expect(regularAces[0]?.privilege).toBe('read');
  });

  it('stores CALDAV:read-free-busy, the calendar-only privilege, and round-trips it', async () => {
    const repository = dataSource.getRepository(CalendarObjectAce);
    const ace = await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        privilege: 'read-free-busy',
        grantDeny: 'grant',
        position: 0,
      }),
    );

    const found = await repository.findOneByOrFail({ id: ace.id });
    expect(found.privilege).toBe('read-free-busy');
  });

  it('rejects a privilege outside the calendar catalog', async () => {
    const repository = dataSource.getRepository(CalendarObjectAce);

    await expect(
      repository.save(
        repository.create({
          calendarObjectId: calendarObject.id,
          principalId: principal.id,
          privilege: 'read-everything' as 'read',
          grantDeny: 'grant',
          position: 0,
        }),
      ),
    ).rejects.toThrow();
  });
});
