import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  GroupMembershipService,
  GroupService,
  Principal,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminErrorBody } from './admin-error-response.js';
import { createAdminRouter } from './router.js';

describe('GET /users/{userId}/groups', () => {
  let dataSource: DataSource;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;
  let acme: Tenant;
  let boss: User;
  let alice: User;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    acme = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    const users = new UserService(dataSource);
    boss = await users.createUser({
      tenantId: acme.id,
      username: 'boss',
      email: 'boss@example.com',
      password: 'pw',
      role: 'tenant_admin',
    });
    alice = await users.createUser({
      tenantId: acme.id,
      username: 'alice',
      email: 'alice@example.com',
      password: 'pw',
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await dataSource.destroy();
  });

  function mountAs(user: User): void {
    const app = express();
    app.use(async (req: Request, _res: Response, next: NextFunction) => {
      req.tenant = acme;
      req.principal = await dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: user.principalId });
      next();
    });
    app.use('/admin', createAdminRouter(dataSource));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const get = (path: string) => fetch(`${baseUrl}/admin${path}`);

  it('lists direct and nested memberships with the way in', async () => {
    const groups = new GroupService(dataSource);
    const members = new GroupMembershipService(dataSource);
    const team = await groups.createGroup({
      tenantId: acme.id,
      name: 'Team',
      description: 'The team',
    });
    const company = await groups.createGroup({
      tenantId: acme.id,
      name: 'Company',
    });
    await members.addMember(team.id, alice.principalId);
    await members.addMember(company.id, team.principalId);
    mountAs(boss);

    const response = await get(`/users/${alice.id}/groups`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groups: [
        {
          id: company.id,
          name: 'Company',
          description: null,
          direct: false,
          via: ['Team'],
        },
        {
          id: team.id,
          name: 'Team',
          description: 'The team',
          direct: true,
          via: [],
        },
      ],
    });
  });

  it('is empty for a user in no group', async () => {
    mountAs(boss);

    expect(await (await get(`/users/${alice.id}/groups`)).json()).toEqual({
      groups: [],
    });
  });

  it('answers 404 for an unknown user', async () => {
    mountAs(boss);

    const response = await get(`/users/${crypto.randomUUID()}/groups`);

    expect(response.status).toBe(404);
    expect(((await response.json()) as AdminErrorBody).error.code).toBe(
      'user_not_found',
    );
  });

  it('is forbidden for a member (403)', async () => {
    mountAs(alice);

    expect((await get(`/users/${alice.id}/groups`)).status).toBe(403);
  });
});
