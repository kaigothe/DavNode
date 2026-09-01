import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  CollectionLock,
  createDataSource,
  createOwnerAllAce,
  FileLock,
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

function lockInfoBody(scope: 'exclusive' | 'shared' = 'exclusive'): string {
  return `<D:lockinfo xmlns:D="DAV:"><D:lockscope><D:${scope}/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>`;
}

describe('UNLOCK route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
  let root: Collection;
  let doc: FileResource;
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
    bob = await userService.createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });

    await dataSource.transaction(async (manager) => {
      root = await manager.getRepository(Collection).save(
        manager.getRepository(Collection).create({
          tenantId: tenant.id,
          parentCollectionId: null,
          ownerPrincipalId: alice.principalId,
          displayName: 'root',
        }),
      );
      await createOwnerAllAce(manager, 'collection', root.id, alice.principalId);

      doc = await manager.getRepository(FileResource).save(
        manager.getRepository(FileResource).create({
          tenantId: tenant.id,
          collectionId: root.id,
          name: 'doc.txt',
          contentType: 'text/plain',
          etag: 'etag-1',
          sizeBytes: 0,
          ownerPrincipalId: alice.principalId,
        }),
      );
      await createOwnerAllAce(manager, 'file', doc.id, alice.principalId);
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

  async function lockDoc(): Promise<string> {
    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'LOCK',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'application/xml',
      },
      body: lockInfoBody(),
    });
    const token = response.headers.get('Lock-Token');
    if (!token) {
      throw new Error('LOCK setup failed');
    }
    return token.slice(1, -1);
  }

  async function unlock(
    path: string,
    token: string | null,
    username = 'alice',
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(username, PASSWORD),
    };
    if (token !== null) {
      headers['Lock-Token'] = `<${token}>`;
    }
    return fetch(`${baseUrl}${path}`, { method: 'UNLOCK', headers });
  }

  it('UNLOCK with a valid token by the lock holder removes the lock, freeing the resource for a new LOCK', async () => {
    const token = await lockDoc();

    const response = await unlock('/dav/acme/files/doc.txt', token);

    expect(response.status).toBe(204);
    const stored = await dataSource
      .getRepository(FileLock)
      .findBy({ fileResourceId: doc.id });
    expect(stored).toHaveLength(0);

    const relocked = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'LOCK',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'application/xml',
      },
      body: lockInfoBody(),
    });
    expect(relocked.status).toBe(200);
  });

  it('UNLOCK by a principal other than the lock holder, without the unlock privilege, returns 403', async () => {
    const token = await lockDoc();

    const response = await unlock('/dav/acme/files/doc.txt', token, 'bob');

    expect(response.status).toBe(403);
    const stored = await dataSource
      .getRepository(FileLock)
      .findBy({ fileResourceId: doc.id });
    expect(stored).toHaveLength(1);
  });

  it('UNLOCK by a principal with the DAV:unlock privilege succeeds even though they are not the lock holder', async () => {
    const token = await lockDoc();
    const aces = dataSource.getRepository(CollectionAce);
    await aces.save(
      aces.create({
        collectionId: root.id,
        principalId: bob.principalId,
        privilege: 'unlock',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const response = await unlock('/dav/acme/files/doc.txt', token, 'bob');

    expect(response.status).toBe(204);
    const stored = await dataSource
      .getRepository(FileLock)
      .findBy({ fileResourceId: doc.id });
    expect(stored).toHaveLength(0);
  });

  it('UNLOCK with an unknown/wrong token returns 409', async () => {
    await lockDoc();

    const response = await unlock(
      '/dav/acme/files/doc.txt',
      'urn:uuid:00000000-0000-0000-0000-000000000000',
    );

    expect(response.status).toBe(409);
    const body = await response.text();
    expect(body).toContain('lock-token-matches-request-uri');
    const stored = await dataSource
      .getRepository(FileLock)
      .findBy({ fileResourceId: doc.id });
    expect(stored).toHaveLength(1);
  });

  it('UNLOCK with no Lock-Token header returns 400', async () => {
    await lockDoc();
    const response = await unlock('/dav/acme/files/doc.txt', null);
    expect(response.status).toBe(400);
  });

  it('UNLOCK on a nonexistent resource returns 404', async () => {
    const response = await unlock(
      '/dav/acme/files/missing.txt',
      'urn:uuid:00000000-0000-0000-0000-000000000000',
    );
    expect(response.status).toBe(404);
  });

  it('UNLOCK on a file whose lock is inherited from a Depth: infinity collection lock resolves and removes the ancestor lock', async () => {
    const lockResponse = await fetch(`${baseUrl}/dav/acme/files`, {
      method: 'LOCK',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'application/xml',
        Depth: 'infinity',
      },
      body: lockInfoBody(),
    });
    expect(lockResponse.status).toBe(200);
    const token = lockResponse.headers.get('Lock-Token')!.slice(1, -1);

    const response = await unlock('/dav/acme/files/doc.txt', token);

    expect(response.status).toBe(204);
    const stored = await dataSource
      .getRepository(CollectionLock)
      .findBy({ collectionId: root.id });
    expect(stored).toHaveLength(0);
  });
});
