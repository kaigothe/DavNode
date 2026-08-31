import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { Credential } from '../entities/credential.entity.js';
import { ALL_ENTITIES, Principal, Tenant, User } from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { AuthProviderRegistry } from './auth-provider-registry.js';
import { BasicAuthProvider } from './basic-auth-provider.js';
import { hashPassword } from './password-hashing.js';

describe('BasicAuthProvider', () => {
  let dataSource: DataSource;
  let provider: BasicAuthProvider;
  let tenant: Tenant;
  let userPrincipal: Principal;

  const PASSWORD = 'correct horse battery staple';

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    provider = new BasicAuthProvider(dataSource);

    tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    userPrincipal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        principalId: userPrincipal.id,
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
      }),
    );
    await dataSource.getRepository(Credential).save(
      dataSource.getRepository(Credential).create({
        userId: user.id,
        type: 'basic',
        passwordHash: await hashPassword(PASSWORD),
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('registers under the registry as "basic"', () => {
    const registry = new AuthProviderRegistry();
    registry.register(provider);

    expect(registry.resolve('basic')).toBe(provider);
  });

  it('returns the user principal for correct credentials', async () => {
    const result = await provider.verify({
      tenantSlug: 'acme',
      username: 'alice',
      password: PASSWORD,
    });

    expect(result?.id).toBe(userPrincipal.id);
  });

  it('returns null for a wrong password', async () => {
    const result = await provider.verify({
      tenantSlug: 'acme',
      username: 'alice',
      password: 'wrong password',
    });

    expect(result).toBeNull();
  });

  it('returns null for an unknown user', async () => {
    const result = await provider.verify({
      tenantSlug: 'acme',
      username: 'nobody',
      password: PASSWORD,
    });

    expect(result).toBeNull();
  });

  it('returns null for an unknown tenant', async () => {
    const result = await provider.verify({
      tenantSlug: 'no-such-tenant',
      username: 'alice',
      password: PASSWORD,
    });

    expect(result).toBeNull();
  });

  it('takes a similar amount of time for an unknown user and a wrong password', async () => {
    async function averageDurationMs(input: unknown): Promise<number> {
      const samples = 3;
      let total = 0;
      for (let i = 0; i < samples; i += 1) {
        const start = performance.now();
        await provider.verify(input);
        total += performance.now() - start;
      }
      return total / samples;
    }

    const unknownUserMs = await averageDurationMs({
      tenantSlug: 'acme',
      username: 'nobody',
      password: PASSWORD,
    });
    const wrongPasswordMs = await averageDurationMs({
      tenantSlug: 'acme',
      username: 'alice',
      password: 'wrong password',
    });

    // Both paths run exactly one argon2id comparison (real or dummy hash),
    // which dominates the cost of the cheap DB lookups either way — a
    // generous bound avoids flakiness while still catching a real
    // short-circuit (which would show up as an order-of-magnitude gap).
    const ratio =
      Math.max(unknownUserMs, wrongPasswordMs) /
      Math.min(unknownUserMs, wrongPasswordMs);
    expect(ratio).toBeLessThan(2);
  });
});
