import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  CollectionChange,
  createDataSource,
  FileAce,
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

describe('COPY route', () => {
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

  async function copy(
    path: string,
    destination: string,
    options: {
      username?: string;
      overwrite?: string;
      depth?: string;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
      Destination: `${baseUrl}${destination}`,
    };
    if (options.overwrite !== undefined) {
      headers.Overwrite = options.overwrite;
    }
    if (options.depth !== undefined) {
      headers.Depth = options.depth;
    }
    return fetch(`${baseUrl}${path}`, { method: 'COPY', headers });
  }

  async function mkcol(path: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'MKCOL',
      headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
    });
  }

  async function put(path: string, body: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
      body: new TextEncoder().encode(body),
    });
  }

  async function get(path: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
    });
  }

  it('copies a file to a new location (201); the original stays unchanged', async () => {
    await put('/dav/acme/files/report.txt', 'hello');

    const response = await copy(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/copy.txt',
    );

    expect(response.status).toBe(201);
    expect(await (await get('/dav/acme/files/report.txt')).text()).toBe(
      'hello',
    );
    expect(await (await get('/dav/acme/files/copy.txt')).text()).toBe('hello');
  });

  it('copies a collection with Depth: infinity recursively; Depth: 0 copies only the empty collection', async () => {
    await mkcol('/dav/acme/files/sub');
    await mkcol('/dav/acme/files/sub/nested');
    await put('/dav/acme/files/sub/top.txt', 'a');
    await put('/dav/acme/files/sub/nested/deep.txt', 'b');

    const infResponse = await copy(
      '/dav/acme/files/sub',
      '/dav/acme/files/sub-full',
      {
        depth: 'infinity',
      },
    );
    expect(infResponse.status).toBe(201);
    expect(await (await get('/dav/acme/files/sub-full/top.txt')).text()).toBe(
      'a',
    );
    expect(
      await (await get('/dav/acme/files/sub-full/nested/deep.txt')).text(),
    ).toBe('b');

    const zeroResponse = await copy(
      '/dav/acme/files/sub',
      '/dav/acme/files/sub-empty',
      { depth: '0' },
    );
    expect(zeroResponse.status).toBe(201);
    expect((await get('/dav/acme/files/sub-empty/top.txt')).status).toBe(404);
  });

  it('gives every copied resource its own protected default-owner ACE, including nested descendants', async () => {
    await mkcol('/dav/acme/files/sub');
    await put('/dav/acme/files/sub/top.txt', 'a');

    await copy('/dav/acme/files/sub', '/dav/acme/files/sub-full', {
      depth: 'infinity',
    });

    const copiedCollection = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ parentCollectionId: root.id, displayName: 'sub-full' });
    const collectionAces = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: copiedCollection.id });
    expect(collectionAces).toEqual([
      expect.objectContaining({
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
      }),
    ]);

    const copiedFile = await dataSource
      .getRepository(FileResource)
      .findOneByOrFail({ collectionId: copiedCollection.id, name: 'top.txt' });
    const fileAces = await dataSource
      .getRepository(FileAce)
      .findBy({ fileResourceId: copiedFile.id });
    expect(fileAces).toEqual([
      expect.objectContaining({
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
      }),
    ]);
  });

  it('returns 412 and changes nothing when the target exists and Overwrite is F', async () => {
    await put('/dav/acme/files/report.txt', 'hello');
    await put('/dav/acme/files/target.txt', 'original');

    const response = await copy(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/target.txt',
      { overwrite: 'F' },
    );

    expect(response.status).toBe(412);
    expect(await (await get('/dav/acme/files/target.txt')).text()).toBe(
      'original',
    );
  });

  it('replaces an existing target (204) when Overwrite is T (the default)', async () => {
    await put('/dav/acme/files/report.txt', 'hello');
    await put('/dav/acme/files/target.txt', 'original');

    const response = await copy(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/target.txt',
    );

    expect(response.status).toBe(204);
    expect(await (await get('/dav/acme/files/target.txt')).text()).toBe(
      'hello',
    );
  });

  it('returns 403 for a Destination in a different tenant', async () => {
    await put('/dav/acme/files/report.txt', 'hello');
    await new TenantService(dataSource).createTenant({
      slug: 'other',
      name: 'Other Inc.',
    });

    const response = await fetch(`${baseUrl}/dav/acme/files/report.txt`, {
      method: 'COPY',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        Destination: `${baseUrl}/dav/other/files/report.txt`,
      },
    });

    expect(response.status).toBe(403);
  });

  it('returns 409 when the destination parent does not exist', async () => {
    await put('/dav/acme/files/report.txt', 'hello');

    const response = await copy(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/no-such-parent/copy.txt',
    );

    expect(response.status).toBe(409);
  });

  it('returns 409 when the destination is inside the source subtree', async () => {
    await mkcol('/dav/acme/files/sub');

    const response = await copy(
      '/dav/acme/files/sub',
      '/dav/acme/files/sub/inner',
    );

    expect(response.status).toBe(409);
  });

  it('returns 404 for a missing source', async () => {
    const response = await copy(
      '/dav/acme/files/no-such-file',
      '/dav/acme/files/copy.txt',
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid Depth on a collection source', async () => {
    await mkcol('/dav/acme/files/sub');

    const response = await copy(
      '/dav/acme/files/sub',
      '/dav/acme/files/sub-copy',
      {
        depth: '1',
      },
    );

    expect(response.status).toBe(400);
  });

  it('returns 403 when the source is owned by a different principal', async () => {
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    const bobFile = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'secret.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 6,
        ownerPrincipalId: bob.principalId,
      }),
    );

    const response = await copy(
      `/dav/acme/files/${bobFile.name}`,
      '/dav/acme/files/copy.txt',
      { username: 'alice' },
    );

    expect(response.status).toBe(403);
  });

  it('returns 403 when the destination parent is owned by a different principal', async () => {
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: bob.principalId,
        displayName: 'bobs-folder',
      }),
    );
    await put('/dav/acme/files/report.txt', 'hello');

    const response = await copy(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/bobs-folder/copy.txt',
      { username: 'alice' },
    );

    expect(response.status).toBe(403);
  });

  it('records a collection_changes entry (added) on the destination parent', async () => {
    await put('/dav/acme/files/report.txt', 'hello');

    const response = await copy(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/copy.txt',
    );
    expect(response.status).toBe(201);

    const changes = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: root.id, action: 'added' });
    expect(changes.some((c) => c.name === 'copy.txt')).toBe(true);
  });
});
