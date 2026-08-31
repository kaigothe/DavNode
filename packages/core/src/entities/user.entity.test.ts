import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { ALL_ENTITIES, Principal, Tenant, User } from './index.js';

describe('User entity', () => {
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

  async function createTenant(slug: string): Promise<Tenant> {
    const repository = dataSource.getRepository(Tenant);
    return repository.save(repository.create({ slug, name: slug }));
  }

  async function createUserPrincipal(tenant: Tenant): Promise<Principal> {
    const repository = dataSource.getRepository(Principal);
    return repository.save(
      repository.create({
        tenantId: tenant.id,
        kind: 'user',
        specialKind: null,
      }),
    );
  }

  it('persists a user and finds it again by tenant and username', async () => {
    const tenant = await createTenant('acme');
    const principal = await createUserPrincipal(tenant);
    const repository = dataSource.getRepository(User);

    await repository.save(
      repository.create({
        principalId: principal.id,
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
      }),
    );

    const found = await repository.findOneByOrFail({
      tenantId: tenant.id,
      username: 'alice',
    });
    expect(found.email).toBe('alice@example.com');
    expect(found.quotaUsedBytes).toBe(0);
    expect(found.quotaLimitBytes).toBeNull();
    expect(found.role).toBe('member');
  });

  it('allows the same username in two different tenants', async () => {
    const tenantA = await createTenant('acme');
    const tenantB = await createTenant('globex');
    const repository = dataSource.getRepository(User);

    await repository.save(
      repository.create({
        principalId: (await createUserPrincipal(tenantA)).id,
        tenantId: tenantA.id,
        username: 'alice',
        email: 'alice@acme.example.com',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          principalId: (await createUserPrincipal(tenantB)).id,
          tenantId: tenantB.id,
          username: 'alice',
          email: 'alice@globex.example.com',
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('rejects the same username twice within the same tenant', async () => {
    const tenant = await createTenant('acme');
    const repository = dataSource.getRepository(User);

    await repository.save(
      repository.create({
        principalId: (await createUserPrincipal(tenant)).id,
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          principalId: (await createUserPrincipal(tenant)).id,
          tenantId: tenant.id,
          username: 'alice',
          email: 'alice2@example.com',
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects two users owning the same principal', async () => {
    const tenant = await createTenant('acme');
    const principal = await createUserPrincipal(tenant);
    const repository = dataSource.getRepository(User);

    await repository.save(
      repository.create({
        principalId: principal.id,
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          principalId: principal.id,
          tenantId: tenant.id,
          username: 'bob',
          email: 'bob@example.com',
        }),
      ),
    ).rejects.toThrow();
  });
});
