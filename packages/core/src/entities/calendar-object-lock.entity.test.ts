import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  CalendarObject,
  CalendarObjectLock,
  Principal,
  Tenant,
} from './index.js';

describe('CalendarObjectLock entity', () => {
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

  it('persists a lock with its scope and owner info', async () => {
    const repository = dataSource.getRepository(CalendarObjectLock);
    const lock = await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        token: 'urn:uuid:11111111-1111-1111-1111-111111111111',
        scope: 'exclusive',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: '<D:href>mailto:alice@example.com</D:href>',
      }),
    );

    const found = await repository.findOneByOrFail({ id: lock.id });
    expect(found.scope).toBe('exclusive');
    expect(found.ownerInfo).toBe('<D:href>mailto:alice@example.com</D:href>');
  });

  it('leaves expiresAt null for an Infinite lock (null timeoutSeconds)', async () => {
    const repository = dataSource.getRepository(CalendarObjectLock);
    const lock = await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        token: 'urn:uuid:22222222-2222-2222-2222-222222222222',
        scope: 'shared',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    const found = await repository.findOneByOrFail({ id: lock.id });
    expect(found.timeoutSeconds).toBeNull();
    expect(found.expiresAt).toBeNull();
  });

  it('rejects a second lock reusing an existing token', async () => {
    const repository = dataSource.getRepository(CalendarObjectLock);
    await repository.save(
      repository.create({
        calendarObjectId: calendarObject.id,
        principalId: principal.id,
        token: 'urn:uuid:44444444-4444-4444-4444-444444444444',
        scope: 'exclusive',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    await expect(
      repository.save(
        repository.create({
          calendarObjectId: calendarObject.id,
          principalId: principal.id,
          token: 'urn:uuid:44444444-4444-4444-4444-444444444444',
          scope: 'shared',
          timeoutSeconds: null,
          expiresAt: null,
          ownerInfo: null,
        }),
      ),
    ).rejects.toThrow();
  });
});
