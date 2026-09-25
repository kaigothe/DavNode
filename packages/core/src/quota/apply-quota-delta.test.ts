import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_ENTITIES, Tenant, User } from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import { applyQuotaDelta, QuotaExceededError } from './apply-quota-delta.js';

describe('applyQuotaDelta', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let user: User;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    user = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: 'correct horse battery staple',
    });
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function setLimits(
    userLimit: number | null,
    tenantLimit: number | null,
  ): Promise<void> {
    await new UserService(dataSource).updateUserQuota(user.id, {
      quotaLimitBytes: userLimit,
    });
    await new TenantService(dataSource).updateTenantQuota(tenant.id, {
      quotaLimitBytes: tenantLimit,
    });
  }

  function apply(deltaBytes: number): Promise<void> {
    return dataSource.transaction((manager) =>
      applyQuotaDelta(manager, {
        userId: user.id,
        tenantId: tenant.id,
        deltaBytes,
      }),
    );
  }

  async function reload(): Promise<{ user: User; tenant: Tenant }> {
    return {
      user: await dataSource
        .getRepository(User)
        .findOneByOrFail({ id: user.id }),
      tenant: await dataSource
        .getRepository(Tenant)
        .findOneByOrFail({ id: tenant.id }),
    };
  }

  it('updates both counters when the delta is below both limits', async () => {
    await setLimits(1000, 1000);

    await apply(100);

    const reloaded = await reload();
    expect(reloaded.user.quotaUsedBytes).toBe(100);
    expect(reloaded.tenant.quotaUsedBytes).toBe(100);
  });

  it('accumulates across several calls', async () => {
    await setLimits(1000, 1000);

    await apply(100);
    await apply(50);

    const reloaded = await reload();
    expect(reloaded.user.quotaUsedBytes).toBe(150);
    expect(reloaded.tenant.quotaUsedBytes).toBe(150);
  });

  it('throws QuotaExceededError("user") and changes nothing when the User limit would be exceeded', async () => {
    await setLimits(100, 1000);

    const error = await apply(150).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QuotaExceededError);
    expect((error as QuotaExceededError).level).toBe('user');
    const reloaded = await reload();
    expect(reloaded.user.quotaUsedBytes).toBe(0);
    expect(reloaded.tenant.quotaUsedBytes).toBe(0);
  });

  it('rolls back an already-applied User update when the Tenant limit is exceeded', async () => {
    await setLimits(null, 50);

    await expect(apply(100)).rejects.toMatchObject({ level: 'tenant' });

    const reloaded = await reload();
    expect(reloaded.user.quotaUsedBytes).toBe(0);
    expect(reloaded.tenant.quotaUsedBytes).toBe(0);
  });

  it('a delta exactly at the limit is allowed (<=, not <)', async () => {
    await setLimits(100, 100);

    await apply(100);

    const reloaded = await reload();
    expect(reloaded.user.quotaUsedBytes).toBe(100);
  });

  it('null quota_limit_bytes means unlimited: an arbitrarily large delta always succeeds', async () => {
    await setLimits(null, null);

    await apply(1_000_000_000);

    const reloaded = await reload();
    expect(reloaded.user.quotaUsedBytes).toBe(1_000_000_000);
    expect(reloaded.tenant.quotaUsedBytes).toBe(1_000_000_000);
  });

  it('a negative delta is never blocked by the limit, even when it would already be at the limit', async () => {
    await setLimits(100, 100);
    await apply(100);

    await apply(-40);

    const reloaded = await reload();
    expect(reloaded.user.quotaUsedBytes).toBe(60);
    expect(reloaded.tenant.quotaUsedBytes).toBe(60);
  });

  it('floors quota_used_bytes at 0 for a negative delta larger than the current usage', async () => {
    await setLimits(100, 100);
    await apply(30);

    await apply(-1000);

    const reloaded = await reload();
    expect(reloaded.user.quotaUsedBytes).toBe(0);
    expect(reloaded.tenant.quotaUsedBytes).toBe(0);
  });

  // A genuinely concurrent version of this test (two separate DB
  // connections racing on the same row) needs Postgres/MySQL's real
  // connection pools — in-memory better-sqlite3 is a single connection,
  // so two "concurrent" dataSource.transaction() calls against it don't
  // exercise real transaction isolation at all (confirmed by hand: the
  // outcome is nondeterministic and unrelated to applyQuotaDelta's own
  // logic). True concurrent-connection race-freedom is proven instead by
  // the scratchpad live-verification script for this Große Aufgabe. This
  // test instead proves the guard itself: called again after a first
  // call already raised quota_used_bytes, the SECOND call's conditional
  // UPDATE reads that up-to-date value — the same property that makes a
  // single atomic UPDATE race-free under two real concurrent connections,
  // since each one's guard is evaluated against whatever the row
  // currently holds, atomically with its own write.
  it('a second call correctly reads the first’s already-applied delta and rejects the combined overflow', async () => {
    await setLimits(100, 1000);

    await apply(60);
    const error = await apply(60).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QuotaExceededError);
    const reloaded = await reload();
    expect(reloaded.user.quotaUsedBytes).toBe(60);
  });
});
