import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  CollectionChange,
  createDataSource,
  createOwnerAllAce,
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

describe('MOVE route', () => {
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
    await createOwnerAllAce(
      dataSource.manager,
      'collection',
      root.id,
      alice.principalId,
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

  async function move(
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
    return fetch(`${baseUrl}${path}`, { method: 'MOVE', headers });
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

  it('moves a file to a new location: available at the new path, 404 at the old, id/createdAt unchanged', async () => {
    await put('/dav/acme/files/report.txt', 'hello');
    const before = await dataSource
      .getRepository(FileResource)
      .findOneByOrFail({ collectionId: root.id, name: 'report.txt' });

    const response = await move(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/moved.txt',
    );

    expect(response.status).toBe(201);
    expect(await (await get('/dav/acme/files/moved.txt')).text()).toBe('hello');
    expect((await get('/dav/acme/files/report.txt')).status).toBe(404);

    const after = await dataSource
      .getRepository(FileResource)
      .findOneByOrFail({ collectionId: root.id, name: 'moved.txt' });
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toEqual(before.createdAt);
  });

  it('returns 400 for Depth: 0', async () => {
    await put('/dav/acme/files/report.txt', 'hello');

    const response = await move(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/moved.txt',
      { depth: '0' },
    );

    expect(response.status).toBe(400);
  });

  it('moves a collection together with its entire subtree', async () => {
    await mkcol('/dav/acme/files/sub');
    await mkcol('/dav/acme/files/sub/nested');
    await put('/dav/acme/files/sub/top.txt', 'a');
    await put('/dav/acme/files/sub/nested/deep.txt', 'b');

    const response = await move(
      '/dav/acme/files/sub',
      '/dav/acme/files/sub-moved',
    );

    expect(response.status).toBe(201);
    expect((await get('/dav/acme/files/sub')).status).toBe(404);
    expect(await (await get('/dav/acme/files/sub-moved/top.txt')).text()).toBe(
      'a',
    );
    expect(
      await (await get('/dav/acme/files/sub-moved/nested/deep.txt')).text(),
    ).toBe('b');
  });

  it('leaves the owner of the moved resource unchanged', async () => {
    await put('/dav/acme/files/report.txt', 'hello');
    const before = await dataSource
      .getRepository(FileResource)
      .findOneByOrFail({ collectionId: root.id, name: 'report.txt' });

    await move('/dav/acme/files/report.txt', '/dav/acme/files/moved.txt');

    const after = await dataSource
      .getRepository(FileResource)
      .findOneByOrFail({ collectionId: root.id, name: 'moved.txt' });
    expect(after.ownerPrincipalId).toBe(before.ownerPrincipalId);
  });

  it('returns 403 for a Destination in a different tenant', async () => {
    await put('/dav/acme/files/report.txt', 'hello');
    await new TenantService(dataSource).createTenant({
      slug: 'other',
      name: 'Other Inc.',
    });

    const response = await fetch(`${baseUrl}/dav/acme/files/report.txt`, {
      method: 'MOVE',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        Destination: `${baseUrl}/dav/other/files/report.txt`,
      },
    });

    expect(response.status).toBe(403);
  });

  it('returns 409 when the destination parent does not exist', async () => {
    await put('/dav/acme/files/report.txt', 'hello');

    const response = await move(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/no-such-parent/moved.txt',
    );

    expect(response.status).toBe(409);
  });

  it('returns 409 when the destination is inside the source subtree', async () => {
    await mkcol('/dav/acme/files/sub');

    const response = await move(
      '/dav/acme/files/sub',
      '/dav/acme/files/sub/inner',
    );

    expect(response.status).toBe(409);
  });

  it('returns 412 and changes nothing when the target exists and Overwrite is F', async () => {
    await put('/dav/acme/files/report.txt', 'hello');
    await put('/dav/acme/files/target.txt', 'original');

    const response = await move(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/target.txt',
      { overwrite: 'F' },
    );

    expect(response.status).toBe(412);
    expect(await (await get('/dav/acme/files/report.txt')).text()).toBe(
      'hello',
    );
    expect(await (await get('/dav/acme/files/target.txt')).text()).toBe(
      'original',
    );
  });

  it('replaces an existing target (204) when Overwrite is T (the default)', async () => {
    await put('/dav/acme/files/report.txt', 'hello');
    await put('/dav/acme/files/target.txt', 'original');

    const response = await move(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/target.txt',
    );

    expect(response.status).toBe(204);
    expect(await (await get('/dav/acme/files/target.txt')).text()).toBe(
      'hello',
    );
  });

  it('returns 404 for a missing source', async () => {
    const response = await move(
      '/dav/acme/files/no-such-file',
      '/dav/acme/files/moved.txt',
    );

    expect(response.status).toBe(404);
  });

  it('returns 403 when the requester lacks unbind on the source parent collection', async () => {
    // MOVE's source check is unbind on the source's *parent* (RFC 3744
    // §7), not the source's own ownership. bobCollection is still
    // nested under alice's own root, so — via correct RFC 3744
    // inheritance — she'd otherwise inherit her own root ACE's grant
    // there too; an explicit deny ACE is what actually isolates it.
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
    await createOwnerAllAce(
      dataSource.manager,
      'collection',
      bobCollection.id,
      bob.principalId,
    );
    await dataSource.getRepository(CollectionAce).save(
      dataSource.getRepository(CollectionAce).create({
        collectionId: bobCollection.id,
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'deny',
        position: 1,
      }),
    );
    const bobFile = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: bobCollection.id,
        name: 'secret.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 6,
        ownerPrincipalId: bob.principalId,
      }),
    );

    const response = await move(
      `/dav/acme/files/${bobCollection.displayName}/${bobFile.name}`,
      '/dav/acme/files/moved.txt',
      { username: 'alice' },
    );

    expect(response.status).toBe(403);
  });

  it('records collection_changes entries (deleted on the old parent, added on the new)', async () => {
    await mkcol('/dav/acme/files/sub');
    await put('/dav/acme/files/report.txt', 'hello');

    const response = await move(
      '/dav/acme/files/report.txt',
      '/dav/acme/files/sub/report.txt',
    );
    expect(response.status).toBe(201);

    const sub = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ parentCollectionId: root.id, displayName: 'sub' });

    const rootChanges = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: root.id });
    expect(
      rootChanges.some(
        (c) => c.action === 'deleted' && c.name === 'report.txt',
      ),
    ).toBe(true);

    const subChanges = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: sub.id });
    expect(
      subChanges.some((c) => c.action === 'added' && c.name === 'report.txt'),
    ).toBe(true);
  });

  it('records both a deleted and an added entry for a rename within the same collection', async () => {
    await put('/dav/acme/files/report.txt', 'hello');

    await move('/dav/acme/files/report.txt', '/dav/acme/files/renamed.txt');

    // Three rows total: the PUT above already added one ("report.txt",
    // added); the MOVE contributes the other two asserted here.
    const changes = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: root.id });
    expect(changes).toHaveLength(3);
    expect(changes.map((c) => ({ name: c.name, action: c.action }))).toEqual(
      expect.arrayContaining([
        { name: 'report.txt', action: 'deleted' },
        { name: 'renamed.txt', action: 'added' },
      ]),
    );
  });
});
