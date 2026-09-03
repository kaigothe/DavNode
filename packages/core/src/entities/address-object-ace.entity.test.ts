import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  AddressObject,
  AddressObjectAce,
  Principal,
  Tenant,
} from './index.js';

describe('AddressObjectAce entity', () => {
  let dataSource: DataSource;
  let addressObject: AddressObject;
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
    const addressbook = await dataSource
      .getRepository(AddressbookCollection)
      .save(
        dataSource.getRepository(AddressbookCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: principal.id,
          displayName: 'Contacts',
        }),
      );
    addressObject = await dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: tenant.id,
        addressbookId: addressbook.id,
        uid: 'uid-1',
        etag: 'etag-1',
        ownerPrincipalId: principal.id,
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists an ACE with its privilege and grant/deny value', async () => {
    const repository = dataSource.getRepository(AddressObjectAce);
    const ace = await repository.save(
      repository.create({
        addressObjectId: addressObject.id,
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

  it('allows several ACEs on the same address object with distinct positions, queryable in order', async () => {
    const repository = dataSource.getRepository(AddressObjectAce);
    await repository.save(
      repository.create({
        addressObjectId: addressObject.id,
        principalId: principal.id,
        privilege: 'write-acl',
        grantDeny: 'deny',
        position: 2,
      }),
    );
    await repository.save(
      repository.create({
        addressObjectId: addressObject.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        position: 0,
        protected: true,
      }),
    );
    await repository.save(
      repository.create({
        addressObjectId: addressObject.id,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const ordered = await repository.find({
      where: { addressObjectId: addressObject.id },
      order: { position: 'ASC' },
    });

    expect(ordered.map((ace) => ace.privilege)).toEqual([
      'all',
      'read',
      'write-acl',
    ]);
  });

  it('distinguishes protected ACEs from regular ones via the protected flag', async () => {
    const repository = dataSource.getRepository(AddressObjectAce);
    await repository.save(
      repository.create({
        addressObjectId: addressObject.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        position: 0,
        protected: true,
      }),
    );
    await repository.save(
      repository.create({
        addressObjectId: addressObject.id,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const protectedAces = await repository.findBy({
      addressObjectId: addressObject.id,
      protected: true,
    });
    const regularAces = await repository.findBy({
      addressObjectId: addressObject.id,
      protected: false,
    });

    expect(protectedAces).toHaveLength(1);
    expect(protectedAces[0]?.privilege).toBe('all');
    expect(regularAces).toHaveLength(1);
    expect(regularAces[0]?.privilege).toBe('read');
  });
});
