import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  AddressbookCollection,
  Principal,
  Tenant,
} from './index.js';

describe('AddressbookCollection entity', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let ownerPrincipal: Principal;

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
    ownerPrincipal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists an addressbook with defaults', async () => {
    const repository = dataSource.getRepository(AddressbookCollection);

    const saved = await repository.save(
      repository.create({
        tenantId: tenant.id,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Contacts',
      }),
    );

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.description).toBeNull();
    expect(found.syncSeq).toBe(0);
  });

  it('allows two addressbooks owned by the same principal to coexist', async () => {
    const repository = dataSource.getRepository(AddressbookCollection);

    await repository.save(
      repository.create({
        tenantId: tenant.id,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Personal',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          tenantId: tenant.id,
          ownerPrincipalId: ownerPrincipal.id,
          displayName: 'Work',
          description: 'Work contacts',
        }),
      ),
    ).resolves.toBeDefined();

    const all = await repository.findBy({
      ownerPrincipalId: ownerPrincipal.id,
    });
    expect(all).toHaveLength(2);
  });

  it('rejects an unknown owner principal (FK constraint)', async () => {
    const repository = dataSource.getRepository(AddressbookCollection);

    await expect(
      repository.save(
        repository.create({
          tenantId: tenant.id,
          ownerPrincipalId: '00000000-0000-0000-0000-000000000000',
          displayName: 'Orphan',
        }),
      ),
    ).rejects.toThrow();
  });
});
