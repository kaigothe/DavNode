import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionChange,
  createDataSource,
  FileResource,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('MKCOL route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let root: Collection;
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
    alice = await userService.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });

    root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: alice.principalId,
        displayName: 'root',
      }),
    );

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  async function mkcol(
    path: string,
    options: { username?: string; body?: string } = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'MKCOL',
      headers: {
        Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
      },
      body: options.body,
    });
  }

  it('creates a collection under an existing parent; it is visible via PROPFIND afterward', async () => {
    const response = await mkcol('/dav/acme/files/sub');

    expect(response.status).toBe(201);

    const propfindResponse = await fetch(`${baseUrl}/dav/acme/files`, {
      method: 'PROPFIND',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        Depth: '1',
      },
    });
    const body = await propfindResponse.text();
    expect(body).toContain('/dav/acme/files/sub');
  });

  it('returns 409 when the parent collection does not exist', async () => {
    const response = await mkcol('/dav/acme/files/no-such-parent/sub');

    expect(response.status).toBe(409);
  });

  it('returns 405 when the target path already exists as a collection', async () => {
    await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'sub',
      }),
    );

    const response = await mkcol('/dav/acme/files/sub');

    expect(response.status).toBe(405);
  });

  it('returns 405 when the target path already exists as a file resource', async () => {
    await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 3,
        ownerPrincipalId: alice.principalId,
      }),
    );

    const response = await mkcol('/dav/acme/files/report.txt');

    expect(response.status).toBe(405);
  });

  it('returns 405 for MKCOL on the tenant root itself', async () => {
    const response = await mkcol('/dav/acme/files');

    expect(response.status).toBe(405);
  });

  it('returns 415 when a request body is sent', async () => {
    const response = await mkcol('/dav/acme/files/sub', {
      body: '<D:mkcol xmlns:D="DAV:"/>',
    });

    expect(response.status).toBe(415);
  });

  it('records a collection_changes entry and bumps syncSeq on the parent', async () => {
    const response = await mkcol('/dav/acme/files/sub');
    expect(response.status).toBe(201);

    const reloadedRoot = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ id: root.id });
    expect(reloadedRoot.syncSeq).toBe(1);

    const changes = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: root.id });
    expect(changes).toEqual([
      expect.objectContaining({
        collectionId: root.id,
        seq: 1,
        name: 'sub',
        action: 'added',
      }),
    ]);
  });

  it('returns 403 when the parent collection is owned by a different principal', async () => {
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    const bobCollection = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: bob.principalId,
        displayName: 'bobs-folder',
      }),
    );

    const response = await mkcol(
      `/dav/acme/files/${bobCollection.displayName}/new-sub`,
      { username: 'alice' },
    );

    expect(response.status).toBe(403);
  });
});
