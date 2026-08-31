import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { ALL_ENTITIES, Collection, Principal, Tenant } from './index.js';

describe('Collection entity', () => {
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

  it('persists a root collection', async () => {
    const repository = dataSource.getRepository(Collection);

    const saved = await repository.save(
      repository.create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Root',
      }),
    );

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.parentCollectionId).toBeNull();
    expect(found.syncSeq).toBe(0);
  });

  it('allows a non-root collection under the root for the same tenant', async () => {
    const repository = dataSource.getRepository(Collection);
    const root = await repository.save(
      repository.create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Root',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          tenantId: tenant.id,
          parentCollectionId: root.id,
          ownerPrincipalId: ownerPrincipal.id,
          displayName: 'Documents',
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a second root collection for the same tenant', async () => {
    const repository = dataSource.getRepository(Collection);
    await repository.save(
      repository.create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Root',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          tenantId: tenant.id,
          parentCollectionId: null,
          ownerPrincipalId: ownerPrincipal.id,
          displayName: 'Another root',
        }),
      ),
    ).rejects.toThrow();
  });

  it('allows a root collection for a different tenant', async () => {
    const repository = dataSource.getRepository(Collection);
    await repository.save(
      repository.create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Root',
      }),
    );

    const otherTenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'globex', name: 'Globex' }),
      );
    const otherPrincipal = await dataSource.getRepository(Principal).save(
      dataSource.getRepository(Principal).create({
        tenantId: otherTenant.id,
        kind: 'user',
        specialKind: null,
      }),
    );

    await expect(
      repository.save(
        repository.create({
          tenantId: otherTenant.id,
          parentCollectionId: null,
          ownerPrincipalId: otherPrincipal.id,
          displayName: 'Root',
        }),
      ),
    ).resolves.toBeDefined();
  });
});
