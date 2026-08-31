import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/index.js';
import { ALL_ENTITIES, Principal, Tenant } from './index.js';

describe('Principal entity', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function createTenant(): Promise<Tenant> {
    return dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
  }

  it('persists a user principal without a special kind', async () => {
    const tenant = await createTenant();
    const repository = dataSource.getRepository(Principal);

    const saved = await repository.save(
      repository.create({
        tenantId: tenant.id,
        kind: 'user',
        specialKind: null,
      }),
    );

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.kind).toBe('user');
    expect(found.specialKind).toBeNull();
    expect(found.tenantId).toBe(tenant.id);
  });

  it('persists a special principal with a special kind', async () => {
    const tenant = await createTenant();
    const repository = dataSource.getRepository(Principal);

    const saved = await repository.save(
      repository.create({
        tenantId: tenant.id,
        kind: 'special',
        specialKind: 'all',
      }),
    );

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.kind).toBe('special');
    expect(found.specialKind).toBe('all');
  });

  it('rejects a non-special principal with a special kind set', async () => {
    const tenant = await createTenant();
    const repository = dataSource.getRepository(Principal);

    await expect(
      repository.save(
        repository.create({
          tenantId: tenant.id,
          kind: 'user',
          specialKind: 'all',
        }),
      ),
    ).rejects.toThrow(/specialKind/);
  });

  it('rejects a special principal without a special kind set', async () => {
    const tenant = await createTenant();
    const repository = dataSource.getRepository(Principal);

    await expect(
      repository.save(
        repository.create({
          tenantId: tenant.id,
          kind: 'special',
          specialKind: null,
        }),
      ),
    ).rejects.toThrow(/specialKind/);
  });
});
