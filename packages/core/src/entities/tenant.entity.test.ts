import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/index.js';
import { ALL_ENTITIES, Tenant } from './index.js';

describe('Tenant entity', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    // In-memory SQLite, fresh per test; migrations build the real schema
    // rather than relying on `synchronize`. Entities/migrations are passed
    // explicitly (see DavNodeDbSchema) since the default filesystem-glob
    // discovery only works against compiled `dist/` output, not the raw
    // TypeScript sources this test runs against.
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

  it('persists a tenant and finds it again by slug', async () => {
    const repository = dataSource.getRepository(Tenant);
    await repository.save(
      repository.create({ slug: 'acme', name: 'Acme Inc.' }),
    );

    const found = await repository.findOneByOrFail({ slug: 'acme' });
    expect(found.name).toBe('Acme Inc.');
    expect(found.quotaUsedBytes).toBe(0);
    expect(found.quotaLimitBytes).toBeNull();
    expect(found.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate slug with a database error', async () => {
    const repository = dataSource.getRepository(Tenant);
    await repository.save(
      repository.create({ slug: 'acme', name: 'Acme Inc.' }),
    );

    await expect(
      repository.save(repository.create({ slug: 'acme', name: 'Other Inc.' })),
    ).rejects.toThrow();
  });

  it('rejects a slug containing characters outside [a-z0-9-]', async () => {
    const repository = dataSource.getRepository(Tenant);

    await expect(
      repository.save(repository.create({ slug: 'Not Valid!', name: 'Bad' })),
    ).rejects.toThrow(/slug/i);
  });
});
