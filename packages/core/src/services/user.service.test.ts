import type { DataSource } from 'typeorm';
import { EntityManager } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyPassword } from '../auth/password-hashing.js';
import { createDataSource } from '../db/data-source.js';
import { Credential } from '../entities/credential.entity.js';
import { ALL_ENTITIES, Principal, Tenant, User } from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { DuplicateEntryError, NotFoundError } from './errors.js';
import { UserService } from './user.service.js';

describe('UserService', () => {
  let dataSource: DataSource;
  let service: UserService;
  let tenant: Tenant;

  const PASSWORD = 'correct horse battery staple';

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new UserService(dataSource);

    tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await dataSource.destroy();
  });

  it('creates a principal, user, and basic credential consistently', async () => {
    const user = await service.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });

    const principal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: user.principalId });
    expect(principal.kind).toBe('user');

    const credential = await dataSource
      .getRepository(Credential)
      .findOneByOrFail({ userId: user.id });
    expect(credential.type).toBe('basic');
    expect(user.role).toBe('member');
  });

  it('creates a user with an explicit role', async () => {
    const user = await service.createUser({
      tenantId: tenant.id,
      username: 'admin',
      email: 'admin@example.com',
      password: PASSWORD,
      role: 'server_admin',
    });

    expect(user.role).toBe('server_admin');
  });

  it('rolls back the entire transaction if credential creation fails', async () => {
    const originalSave = EntityManager.prototype.save;
    let saveCallCount = 0;
    vi.spyOn(EntityManager.prototype, 'save').mockImplementation(function (
      this: EntityManager,
      ...args: Parameters<typeof originalSave>
    ) {
      saveCallCount += 1;
      if (saveCallCount === 3) {
        // 1st = principal, 2nd = user, 3rd = credential.
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
      service.createUser({
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
        password: PASSWORD,
      }),
    ).rejects.toThrow('Simulated failure');

    expect(await dataSource.getRepository(User).find()).toHaveLength(0);
    expect(await dataSource.getRepository(Principal).find()).toHaveLength(0);
    expect(await dataSource.getRepository(Credential).find()).toHaveLength(0);
  });

  it('rejects a duplicate username within the same tenant with a DuplicateEntryError', async () => {
    await service.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });

    await expect(
      service.createUser({
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice2@example.com',
        password: PASSWORD,
      }),
    ).rejects.toThrow(DuplicateEntryError);
  });

  it('stores the password only as an argon2id hash, never plaintext', async () => {
    const user = await service.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });

    const credential = await dataSource
      .getRepository(Credential)
      .findOneByOrFail({ userId: user.id });
    expect(credential.passwordHash).not.toBe(PASSWORD);
    expect(credential.passwordHash).not.toContain(PASSWORD);
    await expect(
      verifyPassword(PASSWORD, credential.passwordHash ?? ''),
    ).resolves.toBe(true);
  });

  it('finds a user by username within its tenant', async () => {
    const created = await service.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });

    await expect(
      service.findUserByUsername(tenant.id, 'alice'),
    ).resolves.toMatchObject({ id: created.id });
  });

  it('returns null from findUserByUsername for an unknown username', async () => {
    await expect(
      service.findUserByUsername(tenant.id, 'nobody'),
    ).resolves.toBeNull();
  });

  it('updates a user quota', async () => {
    const created = await service.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });

    const updated = await service.updateUserQuota(created.id, {
      quotaLimitBytes: 500,
    });

    expect(updated.quotaLimitBytes).toBe(500);
  });

  it('throws NotFoundError when updating the quota of an unknown user', async () => {
    await expect(
      service.updateUserQuota('no-such-id', { quotaLimitBytes: 1 }),
    ).rejects.toThrow(NotFoundError);
  });
});
