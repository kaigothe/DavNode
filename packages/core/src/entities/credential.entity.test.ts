import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
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

  it('stores digest and oauth2 credentials next to the basic one, with unset columns null', async () => {
    const user = await createUser();
    const repository = dataSource.getRepository(Credential);

    await repository.save([
      repository.create({ userId: user.id, type: 'basic', passwordHash: 'h' }),
      repository.create({
        userId: user.id,
        type: 'digest',
        digestHa1: 'ab'.repeat(32),
        digestRealm: 'davnode',
      }),
      repository.create({
        userId: user.id,
        type: 'oauth2',
        oauth2Issuer: 'https://idp.example.com',
        oauth2Subject: 'sub-1',
      }),
    ]);

    const digest = await repository.findOneByOrFail({
      userId: user.id,
      type: 'digest',
    });
    expect(digest).toMatchObject({
      digestRealm: 'davnode',
      passwordHash: null,
      oauth2Issuer: null,
    });
    expect(await repository.countBy({ userId: user.id })).toBe(3);
  });

  it('rejects two credentials with the same (oauth2Issuer, oauth2Subject)', async () => {
    const user = await createUser();
    const second = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        principalId: (
          await dataSource.getRepository(Principal).save(
            dataSource.getRepository(Principal).create({
              tenantId: user.tenantId,
              kind: 'user',
              specialKind: null,
            }),
          )
        ).id,
        tenantId: user.tenantId,
        username: 'bob',
        email: 'bob@example.com',
      }),
    );
    const repository = dataSource.getRepository(Credential);
    const link = (userId: string) =>
      repository.save(
        repository.create({
          userId,
          type: 'oauth2',
          oauth2Issuer: 'https://idp.example.com',
          oauth2Subject: 'same-sub',
        }),
      );
    await link(user.id);

    await expect(link(second.id)).rejects.toThrow(/UNIQUE|unique|duplicate/i);
    expect(await repository.countBy({ type: 'oauth2' })).toBe(1);
  });
});
