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

  it('an empty body with no If header (not a valid refresh) returns 400', async () => {
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

  it('LOCK without a Timeout header grants Second-3600', async () => {
    const response = await lock('/dav/acme/files/doc.txt');
    expect(response.status).toBe(200);
    expect(response.headers.get('Timeout')).toBe('Second-3600');

    const stored = await dataSource
      .getRepository(FileLock)
      .findOneByOrFail({ fileResourceId: doc.id });
    expect(stored.timeoutSeconds).toBe(3600);
    expect(stored.expiresAt).not.toBeNull();
  });

  it('LOCK with Timeout: Infinite is capped to Second-86400', async () => {
    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'LOCK',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'application/xml',
        Timeout: 'Infinite',
      },
      body: lockInfoBody('exclusive'),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Timeout')).toBe('Second-86400');

    const stored = await dataSource
      .getRepository(FileLock)
      .findOneByOrFail({ fileResourceId: doc.id });
    expect(stored.timeoutSeconds).toBe(86400);
  });

  async function refresh(
    path: string,
    token: string,
    options: { username?: string; timeout?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
      If: `(<${token}>)`,
    };
    if (options.timeout !== undefined) {
      headers.Timeout = options.timeout;
    }
    return fetch(`${baseUrl}${path}`, { method: 'LOCK', headers });
  }

  it('refreshing an existing lock extends expiresAt and returns the same token, without a Lock-Token header', async () => {
    const created = await lock('/dav/acme/files/doc.txt');
    const lockToken = created.headers.get('Lock-Token')?.slice(1, -1);
    expect(lockToken).toBeDefined();
    const before = await dataSource
      .getRepository(FileLock)
      .findOneByOrFail({ fileResourceId: doc.id });

    const response = await refresh('/dav/acme/files/doc.txt', lockToken!, {
      timeout: 'Second-7200',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Lock-Token')).toBeNull();
    expect(response.headers.get('Timeout')).toBe('Second-7200');
    const body = await response.text();
    expect(body).toContain(lockToken);

    const after = await dataSource
      .getRepository(FileLock)
      .findOneByOrFail({ fileResourceId: doc.id });
    expect(after.token).toBe(before.token);
    expect(after.expiresAt!.getTime()).toBeGreaterThan(
      before.expiresAt!.getTime(),
    );
  });

  it('a refresh attempt by a principal other than the lock holder returns 403', async () => {
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
    const created = await lock('/dav/acme/files/doc.txt');
    const lockToken = created.headers.get('Lock-Token')!.slice(1, -1);

    const response = await refresh('/dav/acme/files/doc.txt', lockToken, {
      username: 'bob',
    });

    expect(response.status).toBe(403);
  });

  it('refreshing an unknown lock token returns 412', async () => {
    const response = await refresh(
      '/dav/acme/files/doc.txt',
      'urn:uuid:00000000-0000-0000-0000-000000000000',
    );
    expect(response.status).toBe(412);
    const body = await response.text();
    expect(body).toContain('lock-token-matches-request-uri');
  });

  it('refreshing an already-expired lock returns 412', async () => {
    const expiredToken = 'urn:uuid:99999999-9999-9999-9999-999999999999';
    await dataSource.getRepository(FileLock).save(
      dataSource.getRepository(FileLock).create({
        fileResourceId: doc.id,
        principalId: alice.principalId,
        token: expiredToken,
        scope: 'exclusive',
        timeoutSeconds: 60,
        expiresAt: new Date(Date.now() - 1000),
        ownerInfo: null,
      }),
    );

    const response = await refresh('/dav/acme/files/doc.txt', expiredToken);

    expect(response.status).toBe(412);
  });
});
