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

function lockInfoBody(
  scope: 'exclusive' | 'shared' = 'exclusive',
  owner?: string,
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:${scope}/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
  ${owner ? `<D:owner><D:href>${owner}</D:href></D:owner>` : ''}
</D:lockinfo>`;
}

describe('LOCK route', () => {
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

  async function lock(
    path: string,
    options: {
      scope?: 'exclusive' | 'shared';
      depth?: string;
      username?: string;
      owner?: string;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
      'Content-Type': 'application/xml',
    };
    if (options.depth !== undefined) {
      headers.Depth = options.depth;
    }
    return fetch(`${baseUrl}${path}`, {
      method: 'LOCK',
      headers,
      body: lockInfoBody(options.scope, options.owner),
    });
  }

  it('LOCK on an unlocked file returns 200 with a Lock-Token header and a valid lockdiscovery body', async () => {
    const response = await lock('/dav/acme/files/doc.txt', {
      owner: 'mailto:alice@example.com',
    });

    expect(response.status).toBe(200);
    const lockToken = response.headers.get('Lock-Token');
    expect(lockToken).toMatch(/^<urn:uuid:[0-9a-f-]{36}>$/);

    const body = await response.text();
    expect(body).toContain('<D:lockdiscovery>');
    expect(body).toContain('<D:activelock');
    expect(body).toContain('<D:exclusive/>');
    expect(body).toContain('<D:write/>');
    expect(body).toContain(lockToken?.slice(1, -1));
    expect(body).toContain('mailto:alice@example.com');
    expect(body).toContain('/dav/acme/files/doc.txt');

    const stored = await dataSource
      .getRepository(FileLock)
      .findBy({ fileResourceId: doc.id });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.scope).toBe('exclusive');
  });

  it('a second exclusive LOCK on the same file returns 423', async () => {
    const first = await lock('/dav/acme/files/doc.txt');
    expect(first.status).toBe(200);

    const second = await lock('/dav/acme/files/doc.txt');
    expect(second.status).toBe(423);
    const body = await second.text();
    expect(body).toContain('no-conflicting-lock');

    const stored = await dataSource
      .getRepository(FileLock)
      .findBy({ fileResourceId: doc.id });
    expect(stored).toHaveLength(1);
  });

  it('two shared LOCKs on the same file both succeed', async () => {
    const first = await lock('/dav/acme/files/doc.txt', { scope: 'shared' });
    expect(first.status).toBe(200);

    const second = await lock('/dav/acme/files/doc.txt', { scope: 'shared' });
    expect(second.status).toBe(200);

    const stored = await dataSource
      .getRepository(FileLock)
      .findBy({ fileResourceId: doc.id });
    expect(stored).toHaveLength(2);
  });

  it('a shared lock after an existing exclusive lock still conflicts (423)', async () => {
    const first = await lock('/dav/acme/files/doc.txt', { scope: 'exclusive' });
    expect(first.status).toBe(200);

    const second = await lock('/dav/acme/files/doc.txt', { scope: 'shared' });
    expect(second.status).toBe(423);
  });

  it('Depth: infinity on a collection with an already-locked sub-file returns 423 and creates no new lock anywhere', async () => {
    await dataSource.getRepository(FileLock).save(
      dataSource.getRepository(FileLock).create({
        fileResourceId: doc.id,
        principalId: alice.principalId,
        token: 'urn:uuid:11111111-1111-1111-1111-111111111111',
        scope: 'exclusive',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    const response = await lock('/dav/acme/files', { depth: 'infinity' });

    expect(response.status).toBe(423);
    const collectionLocks = await dataSource
      .getRepository(CollectionLock)
      .findBy({ collectionId: root.id });
    expect(collectionLocks).toHaveLength(0);
    const fileLocks = await dataSource
      .getRepository(FileLock)
      .findBy({ fileResourceId: doc.id });
    expect(fileLocks).toHaveLength(1);
  });

  it('Depth: 1 returns 400', async () => {
    const response = await lock('/dav/acme/files/doc.txt', { depth: '1' });
    expect(response.status).toBe(400);

    const stored = await dataSource
      .getRepository(FileLock)
      .findBy({ fileResourceId: doc.id });
    expect(stored).toHaveLength(0);
  });

  it('a request for an unlocked, nonexistent resource returns 404', async () => {
    const response = await lock('/dav/acme/files/missing.txt');
    expect(response.status).toBe(404);
  });

  it('a user without write-content is refused an exclusive lock (403)', async () => {
    const response = await lock('/dav/acme/files/doc.txt', {
      username: 'bob',
      scope: 'exclusive',
    });
    expect(response.status).toBe(403);
  });

  it('a shared lock only requires read, unlike exclusive which needs write-content', async () => {
    const aces = dataSource.getRepository(CollectionAce);
    await aces.save(
      aces.create({
        collectionId: root.id,
        principalId: bob.principalId,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const shared = await lock('/dav/acme/files/doc.txt', {
      username: 'bob',
      scope: 'shared',
    });
    expect(shared.status).toBe(200);

    const exclusive = await lock('/dav/acme/files/doc.txt', {
      username: 'bob',
      scope: 'exclusive',
    });
    expect(exclusive.status).toBe(403);
  });

  it('a malformed lockinfo body returns 400', async () => {
    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'LOCK',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'application/xml',
      },
      body: '<D:not-lockinfo xmlns:D="DAV:"/>',
    });
    expect(response.status).toBe(400);
  });

  it('an empty body (not yet supported as refresh) returns 400', async () => {
    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'LOCK',
      headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
    });
    expect(response.status).toBe(400);
  });

  it('LOCK on a collection succeeds and stores a CollectionLock with the requested depth', async () => {
    const response = await lock('/dav/acme/files', { depth: '0' });
    expect(response.status).toBe(200);

    const stored = await dataSource
      .getRepository(CollectionLock)
      .findBy({ collectionId: root.id });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.depth).toBe('zero');
  });
});
