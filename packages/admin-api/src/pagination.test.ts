import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  GroupService,
  Principal,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
} from '@davnode/core';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminErrorBody } from './admin-error-response.js';
import { createAdminRouter } from './router.js';

describe('list pagination and search', () => {
  let dataSource: DataSource;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    const tenants = new TenantService(dataSource);
    const acme: Tenant = await tenants.createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    await tenants.createTenant({ slug: 'bravo', name: 'Bravo Industries' });
    await tenants.createTenant({ slug: 'charlie', name: 'Charlie' });
    const users = new UserService(dataSource);
    const boss = await users.createUser({
      tenantId: acme.id,
      username: 'boss',
      email: 'boss@example.com',
      password: 'pw',
      role: 'server_admin',
    });
    for (const name of ['alice', 'bob', 'carol', 'dave']) {
      await users.createUser({
        tenantId: acme.id,
        username: name,
        email: `${name}@example.org`,
        password: 'pw',
      });
    }
    const groups = new GroupService(dataSource);
    await groups.createGroup({ tenantId: acme.id, name: 'Sales' });
    await groups.createGroup({
      tenantId: acme.id,
      name: 'Support',
      description: 'Helpdesk team',
    });

    const app = express();
    app.use(async (req: Request, _res: Response, next: NextFunction) => {
      req.tenant = acme;
      req.principal = await dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: boss.principalId });
      next();
    });
    app.use('/admin', createAdminRouter(dataSource));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  const get = (path: string) => fetch(`${baseUrl}/admin${path}`);

  it('returns everything plus the total when no paging is requested', async () => {
    const body = (await (await get('/users')).json()) as {
      users: unknown[];
      total: number;
    };

    expect(body.users).toHaveLength(5);
    expect(body.total).toBe(5);
  });

  it('cuts a page and still reports the unpaged total', async () => {
    const body = (await (await get('/users?limit=2&offset=1')).json()) as {
      users: unknown[];
      total: number;
    };

    expect(body.users).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  it('returns an empty page beyond the end', async () => {
    const body = (await (await get('/users?limit=10&offset=50')).json()) as {
      users: unknown[];
      total: number;
    };

    expect(body.users).toEqual([]);
    expect(body.total).toBe(5);
  });

  it('searches users case-insensitively by username or e-mail', async () => {
    const byName = (await (await get('/users?q=ALI')).json()) as {
      users: { username: string }[];
      total: number;
    };
    const byMail = (await (await get('/users?q=example.org')).json()) as {
      total: number;
    };

    expect(byName.users.map((user) => user.username)).toEqual(['alice']);
    expect(byName.total).toBe(1);
    expect(byMail.total).toBe(4);
  });

  it('searches tenants by slug or name', async () => {
    const body = (await (await get('/tenants?q=industries')).json()) as {
      tenants: { slug: string }[];
      total: number;
    };

    expect(body.tenants.map((tenant) => tenant.slug)).toEqual(['bravo']);
    expect(body.total).toBe(1);
  });

  it('pages and searches groups, including the description', async () => {
    const all = (await (await get('/groups?limit=1')).json()) as {
      groups: unknown[];
      total: number;
    };
    const found = (await (await get('/groups?q=helpdesk')).json()) as {
      groups: { name: string }[];
    };

    expect(all.groups).toHaveLength(1);
    expect(all.total).toBe(2);
    expect(found.groups.map((group) => group.name)).toEqual(['Support']);
  });

  it.each([
    'limit=0',
    'limit=501',
    'limit=-1',
    'limit=abc',
    'limit=1.5',
    'offset=-1',
    'offset=x',
  ])('rejects %s (400 invalid_pagination)', async (query) => {
    const response = await get(`/users?${query}`);

    expect(response.status).toBe(400);
    expect(((await response.json()) as AdminErrorBody).error.code).toBe(
      'invalid_pagination',
    );
  });
});
