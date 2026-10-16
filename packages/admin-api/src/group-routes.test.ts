import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  createDataSource,
  Group,
  GroupMembership,
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

describe('group routes', () => {
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
  function mountAs(managed: Tenant, user: User): void {
    const app = express();
    app.use(async (req: Request, _res: Response, next: NextFunction) => {
      req.tenant = managed;
      req.principal = await dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: user.principalId });
      next();
    });
    app.use('/admin', createAdminRouter(dataSource));
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

  let boss: User;
  let groups: GroupService;
  let memberships: GroupMembershipService;

  beforeEach(async () => {
    boss = await createUser(acme, 'boss', 'tenant_admin');
    groups = new GroupService(dataSource);
    memberships = new GroupMembershipService(dataSource);
    mountAs(acme, boss);
  });

  const newGroup = (name: string, tenant: Tenant = acme) =>
    groups.createGroup({ tenantId: tenant.id, name });

  it('POST creates a group (201), a duplicate name answers 409', async () => {
    const created = await send('POST', '/groups', {
      name: 'team',
      description: 'The team',
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      name: 'team',
      description: 'The team',
    });

    const duplicate = await send('POST', '/groups', { name: 'team' });
    expect(duplicate.status).toBe(409);
    expect(await errorCode(duplicate)).toBe('duplicate_entry');
  });

  it.each([
    [{}, 'invalid_name'],
    [{ name: ' ' }, 'invalid_name'],
    [{ name: 'x', description: 5 }, 'invalid_description'],
  ])('POST %j answers 400 %s', async (body, code) => {
    const response = await send('POST', '/groups', body);
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe(code);
  });

  it("GET lists only this tenant's groups; GET one answers 404 for foreign, unknown and malformed ids", async () => {
    const mine = await newGroup('mine');
    const foreign = await newGroup('theirs', other);

    const list = (await (await send('GET', '/groups')).json()) as {
      groups: { name: string }[];
    };
    expect(list.groups.map((g) => g.name)).toEqual(['mine']);
    expect((await send('GET', `/groups/${mine.id}`)).status).toBe(200);
    for (const id of [
      foreign.id,
      '00000000-0000-4000-8000-000000000000',
      'x',
    ]) {
      const response = await send('GET', `/groups/${id}`);
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe('group_not_found');
    }
  });

  it('DELETE removes the group, its memberships and the ACEs granting to it, but not its members', async () => {
    const team = await newGroup('team');
    const alice = await createUser(acme, 'alice', 'member');
    await memberships.addMember(team.id, alice.principalId);
    const root = await dataSource.getRepository(Collection).save({
      tenantId: acme.id,
      parentCollectionId: null,
      ownerPrincipalId: boss.principalId,
      displayName: 'root',
    });
    await dataSource.getRepository(CollectionAce).save({
      collectionId: root.id,
      principalId: team.principalId,
      privilege: 'read',
      grantDeny: 'grant',
      position: 0,
    });

    const response = await send('DELETE', `/groups/${team.id}`);

    expect(response.status).toBe(204);
    expect(await dataSource.getRepository(Group).countBy({ id: team.id })).toBe(
      0,
    );
    expect(
      await dataSource
        .getRepository(Principal)
        .countBy({ id: team.principalId }),
    ).toBe(0);
    expect(await dataSource.getRepository(CollectionAce).count()).toBe(0);
    expect(await dataSource.getRepository(GroupMembership).count()).toBe(0);
    expect(await dataSource.getRepository(User).countBy({ id: alice.id })).toBe(
      1,
    );
    expect((await send('DELETE', `/groups/${team.id}`)).status).toBe(404);
  });

  it('members: add users and nested groups, list direct members, remove one', async () => {
    const outer = await newGroup('outer');
    const inner = await newGroup('inner');
    const alice = await createUser(acme, 'alice', 'member');

    for (const principalId of [alice.principalId, inner.principalId]) {
      const response = await send('POST', `/groups/${outer.id}/members`, {
        principalId,
      });
      expect(response.status).toBe(204);
    }

    const list = (await (
      await send('GET', `/groups/${outer.id}/members`)
    ).json()) as {
      members: { principalId: string; kind: string; name: string }[];
    };
    expect(list.members.map((m) => [m.kind, m.name]).sort()).toEqual([
      ['group', 'inner'],
      ['user', 'alice'],
    ]);

    const removed = await send(
      'DELETE',
      `/groups/${outer.id}/members/${alice.principalId}`,
    );
    expect(removed.status).toBe(204);
    const after = (await (
      await send('GET', `/groups/${outer.id}/members`)
    ).json()) as {
      members: unknown[];
    };
    expect(after.members).toHaveLength(1);
    expect(
      (await send('DELETE', `/groups/${outer.id}/members/${alice.principalId}`))
        .status,
    ).toBe(204);
  });

  it('adding a duplicate member answers 409 duplicate_entry', async () => {
    const team = await newGroup('team');
    const alice = await createUser(acme, 'alice', 'member');
    await memberships.addMember(team.id, alice.principalId);

    const response = await send('POST', `/groups/${team.id}/members`, {
      principalId: alice.principalId,
    });

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('duplicate_entry');
  });

  it('a membership cycle, including a group in itself, answers 409 cycle_detected with a message', async () => {
    const a = await newGroup('a');
    const b = await newGroup('b');
    await memberships.addMember(a.id, b.principalId);

    for (const [group, member] of [
      [b, a],
      [a, a],
    ]) {
      const response = await send('POST', `/groups/${group!.id}/members`, {
        principalId: member!.principalId,
      });
      expect(response.status).toBe(409);
      const body = (await response.json()) as AdminErrorBody;
      expect(body.error.code).toBe('cycle_detected');
      expect(body.error.message).toMatch(/cycle|itself/);
    }
  });

  it('rejects malformed, foreign and special principals', async () => {
    const team = await newGroup('team');
    const foreignUser = await createUser(other, 'mallory', 'member');
    const special = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ tenantId: acme.id, kind: 'special' });

    for (const [principalId, status, code] of [
      ['nope', 400, 'invalid_principal_id'],
      [foreignUser.principalId, 404, 'principal_not_found'],
      ['00000000-0000-4000-8000-000000000000', 404, 'principal_not_found'],
      [special.id, 400, 'invalid_member_kind'],
    ] as const) {
      const response = await send('POST', `/groups/${team.id}/members`, {
        principalId,
      });
      expect(response.status).toBe(status);
      expect(await errorCode(response)).toBe(code);
    }
    expect(await dataSource.getRepository(GroupMembership).count()).toBe(0);
  });

  it('members/effective resolves a three-level nesting, deduplicated', async () => {
    const top = await newGroup('top');
    const mid = await newGroup('mid');
    const low = await newGroup('low');
    const alice = await createUser(acme, 'alice', 'member');
    const bobby = await createUser(acme, 'bobby', 'member');
    await memberships.addMember(top.id, mid.principalId);
    await memberships.addMember(mid.id, low.principalId);
    await memberships.addMember(low.id, alice.principalId);
    await memberships.addMember(mid.id, alice.principalId); // diamond
    await memberships.addMember(top.id, bobby.principalId);

    const response = await send('GET', `/groups/${top.id}/members/effective`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      members: { principalId: string }[];
    };
    expect(body.members.map((m) => m.principalId).sort()).toEqual(
      [
        mid.principalId,
        low.principalId,
        alice.principalId,
        bobby.principalId,
      ].sort(),
    );
  });

  it('a member gets 403 on every group route, and a foreign tenant_admin 403 wrong_tenant', async () => {
    const team = await newGroup('team');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    mountAs(acme, await createUser(acme, 'plain', 'member'));
    for (const [method, path] of [
      ['GET', '/groups'],
      ['GET', `/groups/${team.id}/members`],
      ['DELETE', `/groups/${team.id}`],
    ] as const) {
      const response = await send(method, path);
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe('insufficient_role');
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    mountAs(acme, await createUser(other, 'boss', 'tenant_admin'));
    const foreign = await send('GET', '/groups');
    expect(foreign.status).toBe(403);
    expect(await errorCode(foreign)).toBe('wrong_tenant');
  });
});
