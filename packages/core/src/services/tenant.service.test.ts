import type { DataSource } from 'typeorm';
import { EntityManager } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_ENTITIES, Principal, Tenant } from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { DuplicateEntryError, NotFoundError } from './errors.js';
import { TenantService } from './tenant.service.js';

describe('TenantService', () => {
  let dataSource: DataSource;
  let service: TenantService;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new TenantService(dataSource);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await dataSource.destroy();
  });

  it('creates a tenant and its 4 special principals', async () => {
    const tenant = await service.createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });

    const principals = await dataSource
      .getRepository(Principal)
      .findBy({ tenantId: tenant.id });
    expect(principals).toHaveLength(4);
    expect(principals.map((p) => p.specialKind).sort()).toEqual(
      ['all', 'authenticated', 'owner', 'unauthenticated'].sort(),
    );
    expect(principals.every((p) => p.kind === 'special')).toBe(true);
  });

  it('rolls back the entire transaction if special-principal creation fails', async () => {
    const originalSave = EntityManager.prototype.save;
    let saveCallCount = 0;
    vi.spyOn(EntityManager.prototype, 'save').mockImplementation(function (
      this: EntityManager,
      ...args: Parameters<typeof originalSave>
    ) {
      saveCallCount += 1;
      if (saveCallCount === 2) {
        // The 2nd save() call is the special-principals batch save.
        return Promise.reject(new Error('Simulated failure'));
      }
      return (
        originalSave as (
          this: EntityManager,
          ...a: Parameters<typeof originalSave>
        ) => ReturnType<typeof originalSave>
      ).apply(this, args);
    });

    await expect(
      service.createTenant({ slug: 'acme', name: 'Acme Inc.' }),
    ).rejects.toThrow('Simulated failure');

    const tenants = await dataSource.getRepository(Tenant).find();
    const principals = await dataSource.getRepository(Principal).find();
    expect(tenants).toHaveLength(0);
    expect(principals).toHaveLength(0);
  });

  it('returns null from findTenantBySlug for an unknown slug', async () => {
    await expect(
      service.findTenantBySlug('no-such-tenant'),
    ).resolves.toBeNull();
  });

  it('finds a tenant by slug', async () => {
    const created = await service.createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });

    await expect(service.findTenantBySlug('acme')).resolves.toMatchObject({
      id: created.id,
    });
  });

  it('rejects a duplicate slug with a DuplicateEntryError', async () => {
    await service.createTenant({ slug: 'acme', name: 'Acme Inc.' });

    await expect(
      service.createTenant({ slug: 'acme', name: 'Other Inc.' }),
    ).rejects.toThrow(DuplicateEntryError);
  });

  it('updates a tenant quota', async () => {
    const created = await service.createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });

    const updated = await service.updateTenantQuota(created.id, {
      quotaLimitBytes: 1_000_000,
    });

    expect(updated.quotaLimitBytes).toBe(1_000_000);
  });

  it('throws NotFoundError when updating the quota of an unknown tenant', async () => {
    await expect(
      service.updateTenantQuota('no-such-id', { quotaLimitBytes: 1 }),
    ).rejects.toThrow(NotFoundError);
  });
});
