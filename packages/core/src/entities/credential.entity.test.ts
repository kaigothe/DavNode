import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/index.js';
import { ALL_ENTITIES, Credential, Principal, Tenant, User } from './index.js';

describe('Credential entity', () => {
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

  async function createUser(): Promise<User> {
    const tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    const principal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        principalId: principal.id,
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
      }),
    );
  }

  it('persists a basic credential and finds it again by userId', async () => {
    const user = await createUser();
    const repository = dataSource.getRepository(Credential);

    await repository.save(
      repository.create({
        userId: user.id,
        type: 'basic',
        passwordHash: 'hashed-password',
      }),
    );

    const found = await repository.findOneByOrFail({ userId: user.id });
    expect(found.type).toBe('basic');
    expect(found.passwordHash).toBe('hashed-password');
    expect(found.createdAt).toBeInstanceOf(Date);
    expect(found.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects a second credential of the same type for the same user', async () => {
    const user = await createUser();
    const repository = dataSource.getRepository(Credential);

    await repository.save(
      repository.create({
        userId: user.id,
        type: 'basic',
        passwordHash: 'hashed-password',
      }),
    );

    await expect(
      repository.save(
        repository.create({
          userId: user.id,
          type: 'basic',
          passwordHash: 'another-hash',
        }),
      ),
    ).rejects.toThrow();
  });
});
