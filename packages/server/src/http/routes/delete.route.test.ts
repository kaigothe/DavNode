import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  CollectionChange,
  CollectionProperty,
  createDataSource,
  createOwnerAllAce,
  FileContent,
  FileProperty,
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

describe('DELETE route', () => {
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

  async function del(path: string, username = 'alice'): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers: { Authorization: basicAuthHeader(username, PASSWORD) },
    });
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

  it('removes a file resource and its content completely, with no orphaned rows', async () => {
    const file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 5,
        ownerPrincipalId: alice.principalId,
      }),
    );
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: file.id,
        data: Buffer.from('hello'),
      }),
    );
    await dataSource.getRepository(FileProperty).save(
      dataSource.getRepository(FileProperty).create({
        fileResourceId: file.id,
        namespace: 'urn:example:ns',
        name: 'reviewed',
        value: 'true',
      }),
    );

    const response = await del('/dav/acme/files/report.txt');

    expect(response.status).toBe(204);
    expect(
      await dataSource.getRepository(FileResource).findBy({ id: file.id }),
    ).toEqual([]);
    expect(
      await dataSource
        .getRepository(FileContent)
        .findBy({ fileResourceId: file.id }),
    ).toEqual([]);
    expect(
      await dataSource
        .getRepository(FileProperty)
        .findBy({ fileResourceId: file.id }),
    ).toEqual([]);
  });

  it('recursively removes a collection and its entire subtree', async () => {
    expect((await mkcol('/dav/acme/files/sub')).status).toBe(201);
    expect((await mkcol('/dav/acme/files/sub/nested')).status).toBe(201);
    expect((await put('/dav/acme/files/sub/top.txt', 'a')).status).toBe(201);
    expect((await put('/dav/acme/files/sub/nested/deep.txt', 'b')).status).toBe(
      201,
    );

    const sub = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ tenantId: tenant.id, displayName: 'sub' });
    const nested = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ tenantId: tenant.id, displayName: 'nested' });
    await dataSource.getRepository(CollectionProperty).save(
      dataSource.getRepository(CollectionProperty).create({
        collectionId: nested.id,
        namespace: 'urn:example:ns',
        name: 'color',
        value: 'blue',
      }),
    );

    const response = await del('/dav/acme/files/sub');

    expect(response.status).toBe(204);
    expect(
      await dataSource.getRepository(Collection).findBy({ id: sub.id }),
    ).toEqual([]);
    expect(
      await dataSource.getRepository(Collection).findBy({ id: nested.id }),
    ).toEqual([]);
    expect(
      await dataSource
        .getRepository(FileResource)
        .findBy({ collectionId: sub.id }),
    ).toEqual([]);
    expect(
      await dataSource
        .getRepository(FileResource)
        .findBy({ collectionId: nested.id }),
    ).toEqual([]);
    expect(
      await dataSource
        .getRepository(CollectionProperty)
        .findBy({ collectionId: nested.id }),
    ).toEqual([]);
    // The nested collection's own collection_changes rows (recorded
    // when top.txt/deep.txt were added) must be cleaned up too, or the
    // delete would fail on a dangling foreign key.
    expect(
      await dataSource
        .getRepository(CollectionChange)
        .findBy({ collectionId: nested.id }),
    ).toEqual([]);
  });

  it('returns 403 for the tenant root collection', async () => {
    const response = await del('/dav/acme/files');

    expect(response.status).toBe(403);
    expect(
      await dataSource.getRepository(Collection).findBy({ id: root.id }),
    ).toHaveLength(1);
  });

  it('returns 404 for a path that does not exist', async () => {
    const response = await del('/dav/acme/files/no-such-file');

    expect(response.status).toBe(404);
  });

  it('records exactly one collection_changes entry (deleted) for a recursive collection delete', async () => {
    await mkcol('/dav/acme/files/sub');
    await mkcol('/dav/acme/files/sub/nested');
    await put('/dav/acme/files/sub/top.txt', 'a');

    const response = await del('/dav/acme/files/sub');
    expect(response.status).toBe(204);

    const reloadedRoot = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ id: root.id });
    const changes = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: root.id });
    const deletedChanges = changes.filter((c) => c.action === 'deleted');
    expect(deletedChanges).toHaveLength(1);
    expect(deletedChanges[0]).toEqual(
      expect.objectContaining({ name: 'sub', action: 'deleted' }),
    );
    expect(reloadedRoot.syncSeq).toBe(changes.length);
  });

  it('records a collection_changes entry (deleted) on the parent after deleting a single file', async () => {
    await put('/dav/acme/files/report.txt', 'hello');

    const response = await del('/dav/acme/files/report.txt');
    expect(response.status).toBe(204);

    const changes = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: root.id, action: 'deleted' });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual(
      expect.objectContaining({ name: 'report.txt', action: 'deleted' }),
    );
  });

  it('returns 403 when the requester lacks unbind on the parent collection', async () => {
    // DELETE authorizes against unbind on the *parent* collection (RFC
    // 3744 §7), not the target's own ownership. bobCollection is still
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
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: bobFile.id,
        data: Buffer.from('secret'),
      }),
    );

    const response = await del(
      `/dav/acme/files/${bobCollection.displayName}/${bobFile.name}`,
      'alice',
    );

    expect(response.status).toBe(403);
  });
});
