import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  createDataSource,
  FileContent,
  FileResource,
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

describe('quota routes', () => {
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

  let admin: User;
  let alice: User;

  /** One 5-byte file owned by alice, with every counter deliberately drifted. */
  async function seedDriftedFile(): Promise<void> {
    const root = await dataSource.getRepository(Collection).save({
      tenantId: acme.id,
      parentCollectionId: null,
      ownerPrincipalId: alice.principalId,
      displayName: 'root',
    });
    const file = await dataSource.getRepository(FileResource).save({
      tenantId: acme.id,
      collectionId: root.id,
      name: 'report.txt',
      contentType: 'text/plain',
      etag: '"1"',
      sizeBytes: 999,
      ownerPrincipalId: alice.principalId,
    });
    await dataSource.getRepository(FileContent).save({
      fileResourceId: file.id,
      data: Buffer.from('hello'),
    });
    await dataSource
      .getRepository(User)
      .update({ id: alice.id }, { quotaUsedBytes: 12345 });
    await dataSource
      .getRepository(Tenant)
      .update({ id: acme.id }, { quotaUsedBytes: 12345 });
  }

  type Overview = {
    tenant: { quotaLimitBytes: number | null; quotaUsedBytes: number };
    users: {
      username: string;
      quotaLimitBytes: number | null;
      quotaUsedBytes: number;
    }[];
  };

  beforeEach(async () => {
    admin = await createUser(acme, 'admin', 'tenant_admin');
    alice = await createUser(acme, 'alice', 'member');
    await createUser(other, 'mallory', 'member');
  });

  it('GET shows tenant and per-user limits and usage', async () => {
    await dataSource
      .getRepository(Tenant)
      .update({ id: acme.id }, { quotaLimitBytes: 1000, quotaUsedBytes: 40 });
    await dataSource
      .getRepository(User)
      .update({ id: alice.id }, { quotaLimitBytes: 300, quotaUsedBytes: 25 });
    mountAs(acme, admin);

    const response = await send('GET', '/quota');

    expect(response.status).toBe(200);
    const body = (await response.json()) as Overview;
    expect(body.tenant).toMatchObject({
      slug: 'acme',
      quotaLimitBytes: 1000,
      quotaUsedBytes: 40,
    });
    expect(body.users).toEqual([
      expect.objectContaining({
        username: 'admin',
        quotaLimitBytes: null,
        quotaUsedBytes: 0,
      }),
      expect.objectContaining({
        username: 'alice',
        quotaLimitBytes: 300,
        quotaUsedBytes: 25,
      }),
    ]);
  });

  it('PATCH by a tenant_admin answers 403 and the limit stays unchanged', async () => {
    mountAs(acme, admin);

    const response = await send('PATCH', '/quota', { quotaLimitBytes: null });

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('insufficient_role');
    await dataSource
      .getRepository(Tenant)
      .update({ id: acme.id }, { quotaLimitBytes: 50 });
    const again = await send('PATCH', '/quota', { quotaLimitBytes: 9999 });
    expect(again.status).toBe(403);
    expect(
      (await dataSource.getRepository(Tenant).findOneByOrFail({ id: acme.id }))
        .quotaLimitBytes,
    ).toBe(50);
  });

  it('PATCH by a server_admin sets or removes the limit of any tenant', async () => {
    const root = await createUser(other, 'root', 'server_admin');
    mountAs(acme, root);

    let response = await send('PATCH', '/quota', {
      quotaLimitBytes: 5_000_000_000,
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as Overview).tenant.quotaLimitBytes).toBe(
      5_000_000_000,
    );

    response = await send('PATCH', '/quota', { quotaLimitBytes: null });
    expect(
      ((await response.json()) as Overview).tenant.quotaLimitBytes,
    ).toBeNull();
  });

  it.each([{}, { quotaLimitBytes: -1 }, { quotaLimitBytes: 'x' }])(
    'PATCH %j answers 400 invalid_quota',
    async (body) => {
      mountAs(acme, await createUser(other, 'root', 'server_admin'));

      const response = await send('PATCH', '/quota', body);

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe('invalid_quota');
    },
  );

  it('POST /quota/recompute corrects drifted counters, as M8 endpoint did', async () => {
    await seedDriftedFile();
    mountAs(acme, admin);

    const response = await send('POST', '/quota/recompute');

    expect(response.status).toBe(200);
    const body = (await response.json()) as Overview;
    expect(body.tenant.quotaUsedBytes).toBe(5);
    expect(body.users.find((u) => u.username === 'alice')?.quotaUsedBytes).toBe(
      5,
    );
    expect(
      (await dataSource.getRepository(User).findOneByOrFail({ id: alice.id }))
        .quotaUsedBytes,
    ).toBe(5);
  });

  it('a server_admin can recompute and view any tenant', async () => {
    await seedDriftedFile();
    mountAs(acme, await createUser(other, 'root', 'server_admin'));

    expect((await send('POST', '/quota/recompute')).status).toBe(200);
    expect(
      ((await (await send('GET', '/quota')).json()) as Overview).tenant
        .quotaUsedBytes,
    ).toBe(5);
  });

  it('a member gets 403 on every quota route, a foreign tenant_admin 403 wrong_tenant', async () => {
    await seedDriftedFile();
    mountAs(acme, alice);
    for (const [method, path] of [
      ['GET', '/quota'],
      ['PATCH', '/quota'],
      ['POST', '/quota/recompute'],
    ] as const) {
      const response = await send(
        method,
        path,
        method === 'PATCH' ? { quotaLimitBytes: null } : undefined,
      );
      expect(response.status).toBe(403);
    }
    expect(
      (await dataSource.getRepository(User).findOneByOrFail({ id: alice.id }))
        .quotaUsedBytes,
    ).toBe(12345);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    mountAs(acme, await createUser(other, 'boss', 'tenant_admin'));
    const foreign = await send('GET', '/quota');
    expect(foreign.status).toBe(403);
    expect(await errorCode(foreign)).toBe('wrong_tenant');
  });
});
