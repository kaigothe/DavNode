import type { DataSource } from 'typeorm';
import { EntityManager } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyPassword } from '../auth/password-hashing.js';
import { createDataSource } from '../db/data-source.js';
import { Credential } from '../entities/credential.entity.js';
import {
  ALL_ENTITIES,
  Collection,
  Principal,
  Tenant,
  User,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { DuplicateEntryError, NotFoundError } from './errors.js';
import { computeDigestHa1 } from '../auth/digest-ha1.js';
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

  const newUser = (username: string, role?: 'member' | 'server_admin') =>
    service.createUser({
      tenantId: tenant.id,
      username,
      email: `${username}@example.com`,
      password: 'pw',
      role,
    });

  it("lists a tenant's users ordered by username and finds one by id", async () => {
    const bob = await newUser('bob');
    await newUser('alice');

    expect((await service.listUsers(tenant.id)).map((u) => u.username)).toEqual(
      ['alice', 'bob'],
    );
    expect((await service.findUserById(tenant.id, bob.id))?.username).toBe(
      'bob',
    );
    expect(await service.findUserById('other-tenant', bob.id)).toBeNull();
  });

  it('updateUser changes only the supplied fields and throws NotFoundError for an unknown user', async () => {
    const user = await newUser('alice');

    const updated = await service.updateUser(user.id, {
      email: 'new@example.com',
      role: 'server_admin',
    });

    expect(updated).toMatchObject({
      email: 'new@example.com',
      role: 'server_admin',
      quotaLimitBytes: null,
    });
    await expect(
      service.updateUser('nope', { email: 'x@y.z' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('countUsersWithRole counts by role', async () => {
    await newUser('a');
    await newUser('b', 'server_admin');

    expect(await service.countUsersWithRole('server_admin')).toBe(1);
    expect(await service.countUsersWithRole('member')).toBe(1);
  });

  it('deleteUser removes the principal, user and credentials by cascade', async () => {
    const user = await newUser('alice');

    await service.deleteUser(user.id);

    expect(await dataSource.getRepository(User).countBy({ id: user.id })).toBe(
      0,
    );
    expect(
      await dataSource
        .getRepository(Principal)
        .countBy({ id: user.principalId }),
    ).toBe(0);
    expect(
      await dataSource.getRepository(Credential).countBy({ userId: user.id }),
    ).toBe(0);
    await expect(service.deleteUser(user.id)).rejects.toThrow(NotFoundError);
  });

  it('ownsRootCollection is true only for the owner of the tenant root collection', async () => {
    const owner = await newUser('owner');
    const other = await newUser('other');
    await dataSource.getRepository(Collection).save({
      tenantId: tenant.id,
      parentCollectionId: null,
      ownerPrincipalId: owner.principalId,
      displayName: 'root',
    });

    expect(await service.ownsRootCollection(owner)).toBe(true);
    expect(await service.ownsRootCollection(other)).toBe(false);
  });

  describe('digest credentials', () => {
    const credentialsOf = (userId: string) =>
      dataSource.getRepository(Credential).findBy({ userId });

    it('createUser stores a digest credential next to the basic one when a realm is configured', async () => {
      const digestService = new UserService(dataSource, {
        digestRealm: 'davnode',
      });

      const user = await digestService.createUser({
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
        password: 'secret-1',
      });

      const credentials = await credentialsOf(user.id);
      expect(credentials.map((c) => c.type).sort()).toEqual([
        'basic',
        'digest',
      ]);
      const digest = credentials.find((c) => c.type === 'digest');
      expect(digest).toMatchObject({
        digestRealm: 'davnode',
        digestHa1: computeDigestHa1('alice', 'davnode', 'secret-1'),
        passwordHash: null,
      });
    });

    it('createUser stores no HA1 when digest is not enabled', async () => {
      const user = await service.createUser({
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
        password: 'secret-1',
      });

      expect((await credentialsOf(user.id)).map((c) => c.type)).toEqual([
        'basic',
      ]);
    });

    it('setUserPassword replaces both the basic hash and the digest HA1', async () => {
      const digestService = new UserService(dataSource, {
        digestRealm: 'davnode',
      });
      const user = await digestService.createUser({
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
        password: 'old-password',
      });

      await digestService.setUserPassword(user.id, 'new-password');

      const credentials = await credentialsOf(user.id);
      const basic = credentials.find((c) => c.type === 'basic');
      const digest = credentials.find((c) => c.type === 'digest');
      expect(await verifyPassword('new-password', basic!.passwordHash!)).toBe(
        true,
      );
      expect(await verifyPassword('old-password', basic!.passwordHash!)).toBe(
        false,
      );
      expect(digest!.digestHa1).toBe(
        computeDigestHa1('alice', 'davnode', 'new-password'),
      );
    });

    it('setUserPassword creates the digest credential for a user that predates digest', async () => {
      const user = await service.createUser({
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
        password: 'old-password',
      });

      await new UserService(dataSource, {
        digestRealm: 'davnode',
      }).setUserPassword(user.id, 'new-password');

      expect((await credentialsOf(user.id)).map((c) => c.type).sort()).toEqual([
        'basic',
        'digest',
      ]);
    });

    it('setUserPassword drops a stale digest credential once digest is disabled', async () => {
      const user = await new UserService(dataSource, {
        digestRealm: 'davnode',
      }).createUser({
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
        password: 'old-password',
      });

      await service.setUserPassword(user.id, 'new-password');

      expect((await credentialsOf(user.id)).map((c) => c.type)).toEqual([
        'basic',
      ]);
    });

    it('setUserPassword throws NotFoundError for an unknown user', async () => {
      await expect(service.setUserPassword('nope', 'x')).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('OAuth2 identity links', () => {
    const issuer = 'https://idp.example.com';
    const credentialsOf = (userId: string) =>
      dataSource.getRepository(Credential).findBy({ userId });

    it('linkOAuth2Identity adds an oauth2 credential and leaves the others alone', async () => {
      const user = await newUser('alice');

      await service.linkOAuth2Identity(user.id, issuer, 'sub-1');

      const credentials = await credentialsOf(user.id);
      expect(credentials.map((c) => c.type).sort()).toEqual([
        'basic',
        'oauth2',
      ]);
      expect(credentials.find((c) => c.type === 'oauth2')).toMatchObject({
        oauth2Issuer: issuer,
        oauth2Subject: 'sub-1',
        passwordHash: null,
      });
    });

    it('refuses an identity already linked to another user and keeps the original link', async () => {
      const alice = await newUser('alice');
      const bob = await newUser('bob');
      await service.linkOAuth2Identity(alice.id, issuer, 'sub-1');

      await expect(
        service.linkOAuth2Identity(bob.id, issuer, 'sub-1'),
      ).rejects.toThrow(DuplicateEntryError);

      expect(await credentialsOf(bob.id)).toHaveLength(1);
      expect(
        (await credentialsOf(alice.id)).find((c) => c.type === 'oauth2'),
      ).toMatchObject({ oauth2Subject: 'sub-1' });
    });

    it('refuses a second link for the same user, and an unknown user', async () => {
      const alice = await newUser('alice');
      await service.linkOAuth2Identity(alice.id, issuer, 'sub-1');

      await expect(
        service.linkOAuth2Identity(alice.id, issuer, 'sub-2'),
      ).rejects.toThrow(DuplicateEntryError);
      await expect(
        service.linkOAuth2Identity('nope', issuer, 'sub-3'),
      ).rejects.toThrow(NotFoundError);
    });

    it('unlinkOAuth2Identity removes only the oauth2 credential', async () => {
      const alice = await newUser('alice');
      await service.linkOAuth2Identity(alice.id, issuer, 'sub-1');

      expect(await service.unlinkOAuth2Identity(alice.id)).toBe(true);
      expect(await service.unlinkOAuth2Identity(alice.id)).toBe(false);

      expect((await credentialsOf(alice.id)).map((c) => c.type)).toEqual([
        'basic',
      ]);
      await service.linkOAuth2Identity(alice.id, issuer, 'sub-1');
    });
  });
});
