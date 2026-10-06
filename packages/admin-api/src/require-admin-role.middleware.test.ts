import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  Principal,
  TenantService,
  User,
  UserService,
  type DataSource,
  type Tenant,
} from '@davnode/core';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminErrorBody } from './admin-error-response.js';
import { requireAdminRole } from './require-admin-role.middleware.js';

const PASSWORD = 'correct horse battery staple';

describe('requireAdminRole', () => {
  let dataSource: DataSource;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let app: Express;
  let server: ReturnType<Express['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    const tenants = new TenantService(dataSource);
    tenantA = await tenants.createTenant({ slug: 'acme', name: 'Acme' });
    tenantB = await tenants.createTenant({ slug: 'other', name: 'Other' });

    app = express();
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
      password: PASSWORD,
      role,
    });
  }

  /** Mounts a probe route behind requireAdminRole, injecting req.tenant/req.principal as the real middleware chain would. */
  function mount(
    targetTenant: Tenant,
    user: User,
    minimumRole: 'tenant_admin' | 'server_admin',
  ): void {
    app.use(async (req: Request, _res: Response, next: NextFunction) => {
      req.tenant = targetTenant;
      req.principal = await dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: user.principalId });
      next();
    });
    app.use(requireAdminRole(dataSource, minimumRole));
    app.get('/probe', (_req, res) => {
      res.json({ reached: true });
    });
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  it("a tenant_admin managing their own tenant passes a 'tenant_admin' minimum", async () => {
    const admin = await createUser(tenantA, 'admin', 'tenant_admin');
    mount(tenantA, admin, 'tenant_admin');

    const response = await fetch(`${baseUrl}/probe`);

    expect(response.status).toBe(200);
  });

  it("a tenant_admin managing a foreign tenant gets 403 wrong_tenant against a 'tenant_admin' minimum", async () => {
    const admin = await createUser(tenantA, 'admin', 'tenant_admin');
    mount(tenantB, admin, 'tenant_admin');

    const response = await fetch(`${baseUrl}/probe`);

    expect(response.status).toBe(403);
    const body = (await response.json()) as AdminErrorBody;
    expect(body.error.code).toBe('wrong_tenant');
  });

  it("a server_admin can manage every tenant against a 'tenant_admin' minimum", async () => {
    const admin = await createUser(tenantA, 'admin', 'server_admin');
    mount(tenantB, admin, 'tenant_admin');

    const response = await fetch(`${baseUrl}/probe`);

    expect(response.status).toBe(200);
  });

  it("a member gets 403 insufficient_role against a 'tenant_admin' minimum, even for their own tenant", async () => {
    const member = await createUser(tenantA, 'member', 'member');
    mount(tenantA, member, 'tenant_admin');

    const response = await fetch(`${baseUrl}/probe`);

    expect(response.status).toBe(403);
    const body = (await response.json()) as AdminErrorBody;
    expect(body.error.code).toBe('insufficient_role');
  });

  it("tenant-management routes ('server_admin' minimum) reject a tenant_admin even in their own tenant", async () => {
    const admin = await createUser(tenantA, 'admin', 'tenant_admin');
    mount(tenantA, admin, 'server_admin');

    const response = await fetch(`${baseUrl}/probe`);

    expect(response.status).toBe(403);
    const body = (await response.json()) as AdminErrorBody;
    expect(body.error.code).toBe('insufficient_role');
  });

  it("tenant-management routes ('server_admin' minimum) let a server_admin through, for any {tenantSlug}", async () => {
    const admin = await createUser(tenantA, 'admin', 'server_admin');
    mount(tenantB, admin, 'server_admin');

    const response = await fetch(`${baseUrl}/probe`);

    expect(response.status).toBe(200);
  });

  it('a member gets 403 for every admin route, including tenant-management ones', async () => {
    const member = await createUser(tenantA, 'member', 'member');
    mount(tenantA, member, 'server_admin');

    const response = await fetch(`${baseUrl}/probe`);

    expect(response.status).toBe(403);
  });
});
