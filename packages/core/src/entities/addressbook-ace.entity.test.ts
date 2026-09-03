import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  AddressbookAce,
  AddressbookCollection,
  Principal,
  Tenant,
} from './index.js';

describe('AddressbookAce entity', () => {
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

  it('persists an ACE with its privilege and grant/deny value', async () => {
    const repository = dataSource.getRepository(AddressbookAce);
    const ace = await repository.save(
      repository.create({
        addressbookId: addressbook.id,
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

  it('allows several ACEs on the same addressbook with distinct positions, queryable in order', async () => {
    const repository = dataSource.getRepository(AddressbookAce);
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        privilege: 'write-acl',
        grantDeny: 'deny',
        position: 2,
      }),
    );
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        position: 0,
        protected: true,
      }),
    );
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const ordered = await repository.find({
      where: { addressbookId: addressbook.id },
      order: { position: 'ASC' },
    });

    expect(ordered.map((ace) => ace.privilege)).toEqual([
      'all',
      'read',
      'write-acl',
    ]);
  });

  it('distinguishes protected ACEs from regular ones via the protected flag', async () => {
    const repository = dataSource.getRepository(AddressbookAce);
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        position: 0,
        protected: true,
      }),
    );
    await repository.save(
      repository.create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const protectedAces = await repository.findBy({
      addressbookId: addressbook.id,
      protected: true,
    });
    const regularAces = await repository.findBy({
      addressbookId: addressbook.id,
      protected: false,
    });

    expect(protectedAces).toHaveLength(1);
    expect(protectedAces[0]?.privilege).toBe('all');
    expect(regularAces).toHaveLength(1);
    expect(regularAces[0]?.privilege).toBe('read');
  });
});
