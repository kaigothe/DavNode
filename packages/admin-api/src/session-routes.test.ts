import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
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
import { createAdminRouter, type AdminRouterOptions } from './router.js';

type Role = 'member' | 'tenant_admin' | 'server_admin';

describe('session routes (/me, /providers)', () => {
  let dataSource: DataSource;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;
  let acme: Tenant;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    acme = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Corp',
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await dataSource.destroy();
  });

  const createUser = (username: string, role: Role) =>
    new UserService(dataSource).createUser({
      tenantId: acme.id,
      username,
      email: `${username}@example.com`,
      password: 'pw',
      role,
    });

  function mountAs(user: User, options: AdminRouterOptions = {}): void {
    const app = express();
    app.use(async (req: Request, _res: Response, next: NextFunction) => {
      req.tenant = acme;
      req.principal = await dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: user.principalId });
      next();
    });
    app.use('/admin', createAdminRouter(dataSource, options));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const get = (path: string) => fetch(`${baseUrl}/admin${path}`);

  describe('GET /me', () => {
    it.each(['member', 'tenant_admin', 'server_admin'] as const)(
      'answers a %s with their own role and tenant',
      async (role) => {
        mountAs(await createUser('pat', role));

        const response = await get('/me');

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          username: 'pat',
          email: 'pat@example.com',
          role,
          tenant: { slug: 'acme', name: 'Acme Corp' },
          anchorTenant: 'acme',
          capabilities: { contentView: false },
        });
      },
    );

    it('reports the content view when it is enabled', async () => {
      mountAs(await createUser('boss', 'tenant_admin'), { contentView: true });

      const body = (await (await get('/me')).json()) as {
        capabilities: { contentView: boolean };
      };

      expect(body.capabilities.contentView).toBe(true);
    });

    it('never contains credentials', async () => {
      mountAs(await createUser('pat', 'member'));

      const text = await (await get('/me')).text();

      expect(text).not.toMatch(/hash|ha1|password/i);
    });
  });

  describe('GET /providers', () => {
    it('lists the providers with their state, basic only by default', async () => {
      mountAs(await createUser('boss', 'tenant_admin'));

      const response = await get('/providers');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        providers: [
          { id: 'basic', enabled: true },
          { id: 'digest', enabled: false },
          { id: 'oauth2', enabled: false },
        ],
        oauth2Issuers: [],
      });
    });

    it('reflects the configured providers and issuers', async () => {
      mountAs(await createUser('boss', 'tenant_admin'), {
        authProviders: ['basic', 'oauth2'],
        oauth2Issuers: ['https://id.example.com'],
      });

      expect(await (await get('/providers')).json()).toEqual({
        providers: [
          { id: 'basic', enabled: true },
          { id: 'digest', enabled: false },
          { id: 'oauth2', enabled: true },
        ],
        oauth2Issuers: ['https://id.example.com'],
      });
    });

    it('is forbidden for a member (403)', async () => {
      mountAs(await createUser('pat', 'member'));

      expect((await get('/providers')).status).toBe(403);
    });
  });
});
