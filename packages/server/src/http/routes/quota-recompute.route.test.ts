import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  createDataSource,
  createOwnerAllAce,
  FileContent,
  FileResource,
  TenantService,
  User,
  UserService,
  type DataSource,
  type Tenant,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('quota-recompute route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let admin: User;
  let member: User;
  let baseUrl: string;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    const userService = new UserService(dataSource);
    admin = await userService.createUser({
      tenantId: tenant.id,
      username: 'admin',
      email: 'admin@example.com',
      password: PASSWORD,
      role: 'tenant_admin',
    });
    member = await userService.createUser({
      tenantId: tenant.id,
      username: 'member',
      email: 'member@example.com',
      password: PASSWORD,
    });

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  function recompute(username: string): Promise<Response> {
    return fetch(`${baseUrl}/dav/acme/admin/quota/recompute`, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(username, PASSWORD) },
    });
  }

  it('a tenant_admin triggers reconciliation and gets the updated numbers back', async () => {
    const root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: member.principalId,
        displayName: 'root',
      }),
    );
    await createOwnerAllAce(
      dataSource.manager,
      'collection',
      root.id,
      member.principalId,
    );
    const file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 999, // deliberately wrong, to prove recompute corrects it
        ownerPrincipalId: member.principalId,
      }),
    );
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: file.id,
        data: Buffer.from('hello'),
      }),
    );
    // quota_used_bytes starts drifted (never touched by the direct
    // repository inserts above, which bypass applyQuotaDelta).
    await dataSource
      .getRepository(User)
      .update({ id: member.id }, { quotaUsedBytes: 12345 });

    const response = await recompute('admin');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      tenant: { id: string; quotaUsedBytes: number };
      users: { id: string; quotaUsedBytes: number }[];
    };
    expect(body.tenant.id).toBe(tenant.id);
    expect(body.tenant.quotaUsedBytes).toBe(5);
    const memberEntry = body.users.find((u) => u.id === member.id);
    expect(memberEntry?.quotaUsedBytes).toBe(5);

    const reloadedMember = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: member.id });
    expect(reloadedMember.quotaUsedBytes).toBe(5);
  });

  it('a server_admin can also trigger reconciliation', async () => {
    await dataSource
      .getRepository(User)
      .update({ id: admin.id }, { role: 'server_admin' });

    const response = await recompute('admin');

    expect(response.status).toBe(200);
  });

  it('a regular member gets 403, and nothing is recomputed', async () => {
    await dataSource
      .getRepository(User)
      .update({ id: member.id }, { quotaUsedBytes: 12345 });

    const response = await recompute('member');

    expect(response.status).toBe(403);
    const reloaded = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: member.id });
    expect(reloaded.quotaUsedBytes).toBe(12345);
  });

  it('requires authentication, like any other DAV route', async () => {
    const response = await fetch(`${baseUrl}/dav/acme/admin/quota/recompute`, {
      method: 'POST',
    });

    expect(response.status).toBe(401);
  });
});
