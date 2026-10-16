import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  createDataSource,
  BasicAuthProvider,
  computeDigestHa1,
  Credential,
  FileContent,
  FileResource,
  Group,
  GroupMembershipService,
  GroupService,
  Principal,
  Tenant,
  TenantService,
  User,
  UserService,
  type DataSource,
} from '@davnode/core';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminErrorBody } from './admin-error-response.js';
import { createAdminRouter } from './router.js';

type Role = 'member' | 'tenant_admin' | 'server_admin';

describe('user routes', () => {
  let dataSource: DataSource;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;
  let acme: Tenant;
  let other: Tenant;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    const tenants = new TenantService(dataSource);
    acme = await tenants.createTenant({ slug: 'acme', name: 'Acme' });
    other = await tenants.createTenant({ slug: 'other', name: 'Other' });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await dataSource.destroy();
  });

  const createUser = (tenant: Tenant, username: string, role: Role) =>
    new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username,
      email: `${username}@example.com`,
      password: 'correct horse battery staple',
      role,
    });

  /** Mounts the real admin router acting as `user` on `managed`'s URL. */
  function mountAs(
    managed: Tenant,
    user: User,
    routerOptions: { digestRealm?: string; oauth2Issuers?: string[] } = {},
  ): void {
    const app = express();
    app.use(async (req: Request, _res: Response, next: NextFunction) => {
      req.tenant = managed;
      req.principal = await dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: user.principalId });
      next();
    });
    app.use('/admin', createAdminRouter(dataSource, routerOptions));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  function send(method: string, path: string, body?: unknown) {
    return fetch(`${baseUrl}/admin${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  const errorCode = async (response: globalThis.Response) =>
    ((await response.json()) as AdminErrorBody).error.code;

  const roleOf = async (id: string) =>
    (await dataSource.getRepository(User).findOneByOrFail({ id })).role;

  describe('as a tenant_admin of their own tenant', () => {
    let boss: User;

    beforeEach(async () => {
      boss = await createUser(acme, 'boss', 'tenant_admin');
      mountAs(acme, boss);
    });

    it('POST creates a member with a credential and never echoes hashes (201)', async () => {
      const response = await send('POST', '/users', {
        username: 'alice',
        email: 'alice@example.com',
        password: 'pw-alice',
      });

      expect(response.status).toBe(201);
      const text = await response.text();
      expect(JSON.parse(text)).toMatchObject({
        username: 'alice',
        role: 'member',
        principalId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
      expect(text).not.toMatch(/hash|digest|password/i);
      const user = await dataSource
        .getRepository(User)
        .findOneByOrFail({ tenantId: acme.id, username: 'alice' });
      expect(
        await dataSource.getRepository(Credential).countBy({ userId: user.id }),
      ).toBe(1);
    });

    it('POST with a duplicate username answers 409', async () => {
      const response = await send('POST', '/users', {
        username: 'boss',
        email: 'x@example.com',
        password: 'pw',
      });

      expect(response.status).toBe(409);
      expect(await errorCode(response)).toBe('duplicate_entry');
    });

    it.each([
      [{ email: 'a@b.c', password: 'x' }, 'invalid_username'],
      [{ username: 'a:b', email: 'a@b.c', password: 'x' }, 'invalid_username'],
      [{ username: 'a/b', email: 'a@b.c', password: 'x' }, 'invalid_username'],
      [{ username: 'a', email: 'nope', password: 'x' }, 'invalid_email'],
      [{ username: 'a', email: 'a@b.c' }, 'invalid_password'],
      [
        { username: 'a', email: 'a@b.c', password: 'x', role: 'god' },
        'invalid_role',
      ],
    ])('POST %j answers 400 %s', async (body, code) => {
      const response = await send('POST', '/users', body);

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe(code);
    });

    it('POST of a tenant_admin works, of a server_admin answers 403 and creates nothing', async () => {
      const ok = await send('POST', '/users', {
        username: 'deputy',
        email: 'd@example.com',
        password: 'pw',
        role: 'tenant_admin',
      });
      expect(ok.status).toBe(201);

      const denied = await send('POST', '/users', {
        username: 'sneaky',
        email: 's@example.com',
        password: 'pw',
        role: 'server_admin',
      });
      expect(denied.status).toBe(403);
      expect(await errorCode(denied)).toBe('role_escalation');
      expect(
        await new UserService(dataSource).findUserByUsername(acme.id, 'sneaky'),
      ).toBeNull();
    });

    it("GET lists only this tenant's users, GET one hides credentials", async () => {
      const alice = await createUser(acme, 'alice', 'member');
      await createUser(other, 'mallory', 'member');

      const list = await send('GET', '/users');
      const body = (await list.json()) as { users: { username: string }[] };
      expect(body.users.map((u) => u.username)).toEqual(['alice', 'boss']);

      const one = await send('GET', `/users/${alice.id}`);
      expect(one.status).toBe(200);
      expect(await one.text()).not.toMatch(/hash|digest|password/i);
    });

    it("GET answers 404 for an unknown id, a malformed id and another tenant's user", async () => {
      const foreign = await createUser(other, 'mallory', 'member');

      for (const id of [
        '00000000-0000-4000-8000-000000000000',
        'not-a-uuid',
        foreign.id,
      ]) {
        const response = await send('GET', `/users/${id}`);
        expect(response.status).toBe(404);
        expect(await errorCode(response)).toBe('user_not_found');
      }
    });

    it('PATCH updates email, quota and role (member to tenant_admin)', async () => {
      const alice = await createUser(acme, 'alice', 'member');

      const response = await send('PATCH', `/users/${alice.id}`, {
        email: 'new@example.com',
        quotaLimitBytes: 4_000_000_000,
        role: 'tenant_admin',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        email: 'new@example.com',
        quotaLimitBytes: 4_000_000_000,
        role: 'tenant_admin',
      });
    });

    it('PATCH to server_admin answers 403 and the role stays unchanged', async () => {
      const alice = await createUser(acme, 'alice', 'member');

      const response = await send('PATCH', `/users/${alice.id}`, {
        role: 'server_admin',
      });

      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe('role_escalation');
      expect(await roleOf(alice.id)).toBe('member');
    });

    it('may not modify or delete an existing server_admin of their tenant', async () => {
      const root = await createUser(acme, 'root', 'server_admin');
      await createUser(other, 'root2', 'server_admin');

      const patch = await send('PATCH', `/users/${root.id}`, {
        role: 'member',
      });
      expect(patch.status).toBe(403);
      const del = await send('DELETE', `/users/${root.id}`, {
        confirmUsername: 'root',
      });
      expect(del.status).toBe(403);
      expect(await roleOf(root.id)).toBe('server_admin');
    });

    it('PATCH rejects invalid values with 400', async () => {
      const alice = await createUser(acme, 'alice', 'member');

      for (const [body, code] of [
        [{ email: 'nope' }, 'invalid_email'],
        [{ quotaLimitBytes: -5 }, 'invalid_quota'],
        [{ role: 'god' }, 'invalid_role'],
      ] as const) {
        const response = await send('PATCH', `/users/${alice.id}`, body);
        expect(response.status).toBe(400);
        expect(await errorCode(response)).toBe(code);
      }
    });

    it('DELETE without or with a wrong confirmUsername answers 400 and deletes nothing', async () => {
      const alice = await createUser(acme, 'alice', 'member');

      for (const body of [undefined, {}, { confirmUsername: 'bob' }]) {
        const response = await send('DELETE', `/users/${alice.id}`, body);
        expect(response.status).toBe(400);
        expect(await errorCode(response)).toBe('confirmation_mismatch');
      }
      expect(
        await dataSource.getRepository(User).countBy({ id: alice.id }),
      ).toBe(1);
    });

    it("DELETE removes the user and everything they own, fixes the tenant's quota at once and keeps groups", async () => {
      const alice = await createUser(acme, 'alice', 'member');
      const bobby = await createUser(acme, 'bobby', 'member');

      // The root collection belongs to the admin, files to alice and bobby.
      const root = await dataSource.getRepository(Collection).save({
        tenantId: acme.id,
        parentCollectionId: null,
        ownerPrincipalId: boss.principalId,
        displayName: 'root',
      });
      const addFile = async (owner: User, content: string) => {
        const file = await dataSource.getRepository(FileResource).save({
          tenantId: acme.id,
          collectionId: root.id,
          name: `${owner.username}.txt`,
          contentType: 'text/plain',
          etag: 'e',
          sizeBytes: content.length,
          ownerPrincipalId: owner.principalId,
        });
        await dataSource.getRepository(FileContent).save({
          fileResourceId: file.id,
          data: Buffer.from(content),
        });
      };
      await addFile(alice, '0123456789');
      await addFile(bobby, '01234');
      await dataSource
        .getRepository(Tenant)
        .update({ id: acme.id }, { quotaUsedBytes: 15 });

      const group = await new GroupService(dataSource).createGroup({
        tenantId: acme.id,
        name: 'team',
      });
      const memberships = new GroupMembershipService(dataSource);
      await memberships.addMember(group.id, alice.principalId);
      await memberships.addMember(group.id, bobby.principalId);

      const response = await send('DELETE', `/users/${alice.id}`, {
        confirmUsername: 'alice',
      });

      expect(response.status).toBe(204);
      expect(
        await dataSource.getRepository(User).countBy({ id: alice.id }),
      ).toBe(0);
      expect(
        await dataSource
          .getRepository(Principal)
          .countBy({ id: alice.principalId }),
      ).toBe(0);
      expect(await dataSource.getRepository(FileResource).count()).toBe(1);
      expect(
        (
          await dataSource
            .getRepository(Tenant)
            .findOneByOrFail({ id: acme.id })
        ).quotaUsedBytes,
      ).toBe(5);
      expect(
        await dataSource.getRepository(Group).countBy({ id: group.id }),
      ).toBe(1);
      expect(
        (await memberships.resolveEffectiveMembers(group.id)).map((p) => p.id),
      ).toEqual([bobby.principalId]);
    });

    it('DELETE of the user owning the tenant root collection answers 409', async () => {
      const alice = await createUser(acme, 'alice', 'member');
      await dataSource.getRepository(Collection).save({
        tenantId: acme.id,
        parentCollectionId: null,
        ownerPrincipalId: alice.principalId,
        displayName: 'root',
      });

      const response = await send('DELETE', `/users/${alice.id}`, {
        confirmUsername: 'alice',
      });

      expect(response.status).toBe(409);
      expect(await errorCode(response)).toBe('owns_root_collection');
      expect(
        await dataSource.getRepository(User).countBy({ id: alice.id }),
      ).toBe(1);
    });
  });

  describe('as a server_admin', () => {
    let root: User;

    beforeEach(async () => {
      root = await createUser(acme, 'root', 'server_admin');
      mountAs(acme, root);
    });

    it('can grant server_admin on create and on update', async () => {
      const created = await send('POST', '/users', {
        username: 'second',
        email: 's@example.com',
        password: 'pw',
        role: 'server_admin',
      });
      expect(created.status).toBe(201);

      const alice = await createUser(acme, 'alice', 'member');
      const patched = await send('PATCH', `/users/${alice.id}`, {
        role: 'server_admin',
      });
      expect(patched.status).toBe(200);
      expect(await roleOf(alice.id)).toBe('server_admin');
    });

    it('can manage a foreign tenant', async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      mountAs(other, root);
      const response = await send('POST', '/users', {
        username: 'newbie',
        email: 'n@example.com',
        password: 'pw',
      });
      expect(response.status).toBe(201);
    });

    it('the last server_admin can be neither deleted nor demoted (409), but can once another exists', async () => {
      const del = await send('DELETE', `/users/${root.id}`, {
        confirmUsername: 'root',
      });
      expect(del.status).toBe(409);
      expect(await errorCode(del)).toBe('last_server_admin');

      const demote = await send('PATCH', `/users/${root.id}`, {
        role: 'member',
      });
      expect(demote.status).toBe(409);
      expect(await roleOf(root.id)).toBe('server_admin');

      await createUser(other, 'root2', 'server_admin');
      const ok = await send('DELETE', `/users/${root.id}`, {
        confirmUsername: 'root',
      });
      expect(ok.status).toBe(204);
    });
  });

  it('a member gets 403 insufficient_role on every user route', async () => {
    const member = await createUser(acme, 'member', 'member');
    mountAs(acme, member);

    for (const [method, path] of [
      ['POST', '/users'],
      ['GET', '/users'],
      ['GET', `/users/${member.id}`],
      ['PATCH', `/users/${member.id}`],
      ['DELETE', `/users/${member.id}`],
    ] as const) {
      const response = await send(
        method,
        path,
        method === 'GET' ? undefined : {},
      );
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe('insufficient_role');
    }
  });

  it('a tenant_admin of another tenant gets 403 wrong_tenant', async () => {
    const foreignAdmin = await createUser(other, 'boss', 'tenant_admin');
    mountAs(acme, foreignAdmin);

    const response = await send('GET', '/users');

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('wrong_tenant');
  });

  describe('POST /users/{id}/password', () => {
    it('resets basic and digest consistently: the new password works, the old one does not', async () => {
      const boss = await createUser(acme, 'boss', 'tenant_admin');
      const alice = await new UserService(dataSource, {
        digestRealm: 'davnode',
      }).createUser({
        tenantId: acme.id,
        username: 'alice',
        email: 'alice@example.com',
        password: 'old-password',
      });
      mountAs(acme, boss, { digestRealm: 'davnode' });

      const response = await send('POST', `/users/${alice.id}/password`, {
        password: 'new-password',
      });

      expect(response.status).toBe(204);
      const basic = new BasicAuthProvider(dataSource);
      const login = (password: string) =>
        basic.verify({ tenantSlug: 'acme', username: 'alice', password });
      expect(await login('new-password')).not.toBeNull();
      expect(await login('old-password')).toBeNull();
      const digest = await dataSource
        .getRepository(Credential)
        .findOneByOrFail({ userId: alice.id, type: 'digest' });
      expect(digest.digestHa1).toBe(
        computeDigestHa1('alice', 'davnode', 'new-password'),
      );
    });

    it('creates no digest credential when digest is not enabled', async () => {
      const boss = await createUser(acme, 'boss', 'tenant_admin');
      const alice = await createUser(acme, 'alice', 'member');
      mountAs(acme, boss);

      const response = await send('POST', `/users/${alice.id}/password`, {
        password: 'new-password',
      });

      expect(response.status).toBe(204);
      expect(
        await dataSource
          .getRepository(Credential)
          .countBy({ userId: alice.id, type: 'digest' }),
      ).toBe(0);
    });

    it('rejects a missing password (400), an unknown user (404) and a member (403)', async () => {
      const boss = await createUser(acme, 'boss', 'tenant_admin');
      const alice = await createUser(acme, 'alice', 'member');
      mountAs(acme, boss);

      const missing = await send('POST', `/users/${alice.id}/password`, {});
      expect(missing.status).toBe(400);
      expect(await errorCode(missing)).toBe('invalid_password');
      const unknown = await send(
        'POST',
        '/users/00000000-0000-4000-8000-000000000000/password',
        { password: 'x' },
      );
      expect(unknown.status).toBe(404);

      await new Promise<void>((resolve) => server.close(() => resolve()));
      mountAs(acme, alice);
      const denied = await send('POST', `/users/${alice.id}/password`, {
        password: 'x',
      });
      expect(denied.status).toBe(403);
    });

    it('a tenant_admin cannot reset the password of a server_admin', async () => {
      const boss = await createUser(acme, 'boss', 'tenant_admin');
      const root = await createUser(acme, 'root', 'server_admin');
      mountAs(acme, boss);

      const response = await send('POST', `/users/${root.id}/password`, {
        password: 'hijacked',
      });

      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe('role_escalation');
      expect(
        await new BasicAuthProvider(dataSource).verify({
          tenantSlug: 'acme',
          username: 'root',
          password: 'hijacked',
        }),
      ).toBeNull();
    });
  });

  describe('OAuth2 identity links', () => {
    const issuer = 'https://idp.example.com';
    const link = (userId: string, body: unknown) =>
      send('POST', `/users/${userId}/oauth2-link`, body);
    const oauth2Credentials = () =>
      dataSource.getRepository(Credential).findBy({ type: 'oauth2' });

    it('links an identity of a configured issuer (201) and unlinks it again (204), keeping Basic', async () => {
      const boss = await createUser(acme, 'boss', 'tenant_admin');
      const alice = await createUser(acme, 'alice', 'member');
      mountAs(acme, boss, { oauth2Issuers: [issuer] });

      const linked = await link(alice.id, { issuer, subject: 'sub-1' });
      expect(linked.status).toBe(201);
      expect(await linked.json()).toEqual({ issuer, subject: 'sub-1' });
      expect(await oauth2Credentials()).toHaveLength(1);

      const unlinked = await send('DELETE', `/users/${alice.id}/oauth2-link`);
      expect(unlinked.status).toBe(204);
      expect(await oauth2Credentials()).toHaveLength(0);
      expect(
        await new BasicAuthProvider(dataSource).verify({
          tenantSlug: 'acme',
          username: 'alice',
          password: 'correct horse battery staple',
        }),
      ).not.toBeNull();
      expect(
        (await send('DELETE', `/users/${alice.id}/oauth2-link`)).status,
      ).toBe(404);
    });

    it('answers 400 for an issuer that is not configured, or when OAuth2 is not enabled at all', async () => {
      const boss = await createUser(acme, 'boss', 'tenant_admin');
      const alice = await createUser(acme, 'alice', 'member');
      mountAs(acme, boss, { oauth2Issuers: [issuer] });

      const other = await link(alice.id, {
        issuer: 'https://evil.example.com',
        subject: 'sub-1',
      });
      expect(other.status).toBe(400);
      expect(await errorCode(other)).toBe('unknown_issuer');
      expect((await link(alice.id, { issuer })).status).toBe(400);
      expect(await oauth2Credentials()).toHaveLength(0);

      await new Promise<void>((resolve) => server.close(() => resolve()));
      mountAs(acme, boss);
      expect((await link(alice.id, { issuer, subject: 's' })).status).toBe(400);
    });

    it('answers 409 for an identity already linked to another user and keeps the original link', async () => {
      const boss = await createUser(acme, 'boss', 'tenant_admin');
      const alice = await createUser(acme, 'alice', 'member');
      const bobby = await createUser(acme, 'bobby', 'member');
      mountAs(acme, boss, { oauth2Issuers: [issuer] });
      await link(alice.id, { issuer, subject: 'sub-1' });

      const conflict = await link(bobby.id, { issuer, subject: 'sub-1' });

      expect(conflict.status).toBe(409);
      expect(await errorCode(conflict)).toBe('duplicate_entry');
      const remaining = await oauth2Credentials();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.userId).toBe(alice.id);
    });

    it('a tenant_admin cannot link or unlink an identity of a server_admin; a member cannot link at all', async () => {
      const boss = await createUser(acme, 'boss', 'tenant_admin');
      const root = await createUser(acme, 'root', 'server_admin');
      mountAs(acme, boss, { oauth2Issuers: [issuer] });

      const linked = await link(root.id, { issuer, subject: 'sub-1' });
      expect(linked.status).toBe(403);
      expect(await errorCode(linked)).toBe('role_escalation');
      expect(
        (await send('DELETE', `/users/${root.id}/oauth2-link`)).status,
      ).toBe(403);

      await new Promise<void>((resolve) => server.close(() => resolve()));
      const member = await createUser(acme, 'plain', 'member');
      mountAs(acme, member, { oauth2Issuers: [issuer] });
      expect((await link(member.id, { issuer, subject: 's' })).status).toBe(
        403,
      );
      expect(await oauth2Credentials()).toHaveLength(0);
    });
  });
});
