import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_ENTITIES } from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import * as recomputeQuotaModule from '../quota/recompute-quota.js';
import {
  reconcileAllTenants,
  startQuotaReconciliationCron,
} from './quota-reconciliation-cron.js';

describe('reconcileAllTenants', () => {
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
    vi.restoreAllMocks();
    await dataSource.destroy();
  });

  it("a failing tenant doesn't abort reconciliation of the ones after it, and each failure is logged", async () => {
    const tenants = new TenantService(dataSource);
    const first = await tenants.createTenant({ slug: 'first', name: 'First' });
    const second = await tenants.createTenant({
      slug: 'second',
      name: 'Second',
    });
    const third = await tenants.createTenant({ slug: 'third', name: 'Third' });

    const recomputeSpy = vi
      .spyOn(recomputeQuotaModule, 'recomputeQuotaForTenant')
      .mockImplementation(async (_ds, tenantId) => {
        if (tenantId === second.id) {
          throw new Error('simulated failure for the second tenant');
        }
      });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await reconcileAllTenants(dataSource);

    expect(recomputeSpy).toHaveBeenCalledTimes(3);
    expect(recomputeSpy.mock.calls.map((call) => call[1])).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain('second');
  });

  it('processes tenants sequentially, one at a time, not concurrently', async () => {
    const tenants = new TenantService(dataSource);
    const first = await tenants.createTenant({ slug: 'first', name: 'First' });
    const second = await tenants.createTenant({
      slug: 'second',
      name: 'Second',
    });

    const order: string[] = [];
    vi.spyOn(
      recomputeQuotaModule,
      'recomputeQuotaForTenant',
    ).mockImplementation(async (_ds, tenantId) => {
      order.push(`start:${tenantId}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end:${tenantId}`);
    });

    await reconcileAllTenants(dataSource);

    expect(order).toEqual([
      `start:${first.id}`,
      `end:${first.id}`,
      `start:${second.id}`,
      `end:${second.id}`,
    ]);
  });
});

describe('startQuotaReconciliationCron', () => {
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

  it('accepts a configured cron expression and returns a stoppable task', async () => {
    const task = startQuotaReconciliationCron(dataSource, '*/5 * * * *');
    try {
      expect(task.getPattern()).toBe('*/5 * * * *');
    } finally {
      await task.stop();
    }
  });

  it('falls back to the default daily schedule when none is given', async () => {
    const task = startQuotaReconciliationCron(dataSource);
    try {
      expect(task.getPattern()).toBe('0 3 * * *');
    } finally {
      await task.stop();
    }
  });

  it('rejects an invalid cron expression instead of silently never reconciling anything', () => {
    expect(() =>
      startQuotaReconciliationCron(dataSource, 'not a cron expression'),
    ).toThrow();
  });
});
