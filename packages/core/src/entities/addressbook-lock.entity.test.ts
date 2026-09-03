import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  AddressbookLock,
  Principal,
  Tenant,
} from './index.js';

describe('AddressbookLock entity', () => {
  let dataSource: DataSource;
  let addressbook: AddressbookCollection;
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
    addressbook = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: principal.id,
        displayName: 'Contacts',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists a lock with its scope, depth and owner info', async () => {
    const repository = dataSource.getRepository(AddressbookLock);
    const lock = await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        token: 'urn:uuid:11111111-1111-1111-1111-111111111111',
        scope: 'exclusive',
        depth: 'infinity',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: '<D:href>mailto:alice@example.com</D:href>',
      }),
    );

    const found = await repository.findOneByOrFail({ id: lock.id });
    expect(found.scope).toBe('exclusive');
    expect(found.depth).toBe('infinity');
    expect(found.ownerInfo).toBe(
      '<D:href>mailto:alice@example.com</D:href>',
    );
  });

  it('leaves expiresAt null for an Infinite lock (null timeoutSeconds)', async () => {
    const repository = dataSource.getRepository(AddressbookLock);
    const lock = await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        token: 'urn:uuid:22222222-2222-2222-2222-222222222222',
        scope: 'shared',
        depth: 'zero',
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
    const repository = dataSource.getRepository(AddressbookLock);
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        token: 'urn:uuid:44444444-4444-4444-4444-444444444444',
        scope: 'exclusive',
        depth: 'zero',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    await expect(
      repository.save(
        repository.create({
          addressbookId: addressbook.id,
          principalId: principal.id,
          token: 'urn:uuid:44444444-4444-4444-4444-444444444444',
          scope: 'shared',
          depth: 'zero',
          timeoutSeconds: null,
          expiresAt: null,
          ownerInfo: null,
        }),
      ),
    ).rejects.toThrow();
  });
});
