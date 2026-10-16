import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
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

describe('tenant routes', () => {
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

  async function createUser(
    tenant: Tenant,
    username: string,
    role: 'member' | 'tenant_admin' | 'server_admin',
  ): Promise<User> {
    return new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username,
      email: `${username}@example.com`,
      password: 'correct horse battery staple',
      role,
    });
  }

  /** Mounts the real admin router, injecting req.tenant/req.principal as the server's auth middleware would. */
  function mountAs(anchor: Tenant, user: User): void {
    const app = express();
    app.use(async (req: Request, _res: Response, next: NextFunction) => {
      req.tenant = anchor;
      req.principal = await dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: user.principalId });
      next();
    });
    app.use('/admin', createAdminRouter(dataSource));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  function del(slug: string, body?: string): Promise<Response> {
    return fetch(`${baseUrl}/admin/tenants/${slug}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body,
    }) as unknown as Promise<Response>;
  }

  const tenantExists = async (slug: string) =>
    (await dataSource.getRepository(Tenant).findOneBy({ slug })) !== null;

  it('a server_admin deletes another tenant with a matching confirmSlug: 204, tenant gone', async () => {
    mountAs(acme, await createUser(acme, 'root', 'server_admin'));

    const response = await del(
      'other',
      JSON.stringify({ confirmSlug: 'other' }),
    );

    expect(response.status).toBe(204);
    expect(await tenantExists('other')).toBe(false);
    expect(await tenantExists('acme')).toBe(true);
    expect(
      await dataSource.getRepository(Principal).countBy({ tenantId: other.id }),
    ).toBe(0);
  });

  it.each([
    ['no body', undefined],
    ['an empty object', '{}'],
    ['a different slug', JSON.stringify({ confirmSlug: 'acme' })],
    ['a non-string confirmSlug', JSON.stringify({ confirmSlug: 5 })],
  ])(
    '%s answers 400 confirmation_mismatch and deletes nothing',
    async (_name, body) => {
      mountAs(acme, await createUser(acme, 'root', 'server_admin'));

      const response = await del('other', body);

      expect(response.status).toBe(400);
      expect(((await response.json()) as AdminErrorBody).error.code).toBe(
        'confirmation_mismatch',
      );
      expect(await tenantExists('other')).toBe(true);
    },
  );

  it('a malformed JSON body answers 400 invalid_body', async () => {
    mountAs(acme, await createUser(acme, 'root', 'server_admin'));

    const response = await del('other', '{not json');

    expect(response.status).toBe(400);
    expect(((await response.json()) as AdminErrorBody).error.code).toBe(
      'invalid_body',
    );
    expect(await tenantExists('other')).toBe(true);
  });

  it('an unknown target tenant answers 404 tenant_not_found', async () => {
    mountAs(acme, await createUser(acme, 'root', 'server_admin'));

    const response = await del(
      'ghost',
      JSON.stringify({ confirmSlug: 'ghost' }),
    );

    expect(response.status).toBe(404);
    expect(((await response.json()) as AdminErrorBody).error.code).toBe(
      'tenant_not_found',
    );
  });

  it.each(['tenant_admin', 'member'] as const)(
    'a %s gets 403 and nothing is deleted, even for their own tenant',
    async (role) => {
      mountAs(acme, await createUser(acme, 'someone', role));

      const response = await del(
        'acme',
        JSON.stringify({ confirmSlug: 'acme' }),
      );

      expect(response.status).toBe(403);
      expect(((await response.json()) as AdminErrorBody).error.code).toBe(
        'insufficient_role',
      );
      expect(await tenantExists('acme')).toBe(true);
    },
  );
});
