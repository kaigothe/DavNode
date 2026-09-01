import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  createDataSource,
  createOwnerAllAce,
  FileContent,
  FileResource,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function lockInfoBody(scope: 'exclusive' | 'shared' = 'exclusive'): string {
  return `<D:lockinfo xmlns:D="DAV:"><D:lockscope><D:${scope}/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>`;
}

/**
 * End-to-end tests for the lock-enforcement middleware
 * (`createLockEnforcementMiddleware`/`checkLockEnforcement`), wired into
 * MKCOL, PUT, PROPPATCH, DELETE, COPY, and MOVE
 * (`milestones/M4-locking-sync/05-lock-enforcement-middleware`). Each
 * M2/M3 route's own test file already re-verifies that route's
 * unlocked-resource behavior is unaffected (an empty effective-lock set
 * trivially satisfies `hasValidLockToken`); this file instead covers
 * the cross-cutting locked-resource acceptance criteria, the same split
 * `acl-authorization.middleware.test.ts` uses for ACL.
 */
describe('Lock-enforcement middleware', () => {
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
          sizeBytes: 5,
          ownerPrincipalId: alice.principalId,
        }),
      );
      await createOwnerAllAce(manager, 'file', doc.id, alice.principalId);
      await manager.getRepository(FileContent).save(
        manager
          .getRepository(FileContent)
          .create({ fileResourceId: doc.id, data: Buffer.from('hello') }),
      );
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
    options: { depth?: string; scope?: 'exclusive' | 'shared' } = {},
  ): Promise<string> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader('alice', PASSWORD),
      'Content-Type': 'application/xml',
    };
    if (options.depth !== undefined) {
      headers.Depth = options.depth;
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'LOCK',
      headers,
      body: lockInfoBody(options.scope),
    });
    const token = response.headers.get('Lock-Token');
    if (!token) {
      throw new Error(`LOCK setup failed for ${path}: ${response.status}`);
    }
    return token.slice(1, -1);
  }

  function withIf(token?: string): Record<string, string> {
    return token ? { If: `(<${token}>)` } : {};
  }

  it('PUT (overwrite) of a locked file without an If header returns 423', async () => {
    await lock('/dav/acme/files/doc.txt');

    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'PUT',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'text/plain',
      },
      body: 'new content',
    });

    expect(response.status).toBe(423);
    const body = await response.text();
    expect(body).toContain('lock-token-submitted');
  });

  it('PUT (overwrite) with the correct lock token in the If header succeeds', async () => {
    const token = await lock('/dav/acme/files/doc.txt');

    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'PUT',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'text/plain',
        ...withIf(token),
      },
      body: 'new content',
    });

    expect(response.status).toBe(204);
  });

  it('MKCOL inside a Depth: infinity-locked collection without a token returns 423', async () => {
    await lock('/dav/acme/files', { depth: 'infinity' });

    const response = await fetch(`${baseUrl}/dav/acme/files/sub`, {
      method: 'MKCOL',
      headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
    });

    expect(response.status).toBe(423);
  });

  it('MKCOL inside a Depth: infinity-locked collection with the token succeeds', async () => {
    const token = await lock('/dav/acme/files', { depth: 'infinity' });

    const response = await fetch(`${baseUrl}/dav/acme/files/sub`, {
      method: 'MKCOL',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        ...withIf(token),
      },
    });

    expect(response.status).toBe(201);
  });

  it('DELETE of an unlocked file inside a Depth: infinity-locked parent without a token returns 423', async () => {
    await lock('/dav/acme/files', { depth: 'infinity' });

    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'DELETE',
      headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
    });

    expect(response.status).toBe(423);
  });

  it('DELETE succeeds once the parent collection lock token is submitted', async () => {
    const token = await lock('/dav/acme/files', { depth: 'infinity' });

    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'DELETE',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        ...withIf(token),
      },
    });

    expect(response.status).toBe(204);
  });

  it('a user without write-content gets 403, not 423, on a locked resource regardless of the If header', async () => {
    await lock('/dav/acme/files/doc.txt');

    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'PUT',
      headers: {
        Authorization: basicAuthHeader('bob', PASSWORD),
        'Content-Type': 'text/plain',
      },
      body: 'new content',
    });

    expect(response.status).toBe(403);
  });

  it('PROPPATCH of a locked resource without a token returns 423, and succeeds with it', async () => {
    const token = await lock('/dav/acme/files/doc.txt');
    const body =
      '<D:propertyupdate xmlns:D="DAV:"><D:set><D:prop><D:displayname>x</D:displayname></D:prop></D:set></D:propertyupdate>';

    const withoutToken = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'PROPPATCH',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'application/xml',
      },
      body,
    });
    expect(withoutToken.status).toBe(423);

    const withToken = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'PROPPATCH',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'application/xml',
        ...withIf(token),
      },
      body,
    });
    expect(withToken.status).toBe(207);
  });

  it('MOVE of a locked source without a token returns 423, and succeeds with it', async () => {
    const token = await lock('/dav/acme/files/doc.txt');

    const withoutToken = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'MOVE',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        Destination: `${baseUrl}/dav/acme/files/moved.txt`,
      },
    });
    expect(withoutToken.status).toBe(423);

    const withToken = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'MOVE',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        Destination: `${baseUrl}/dav/acme/files/moved.txt`,
        ...withIf(token),
      },
    });
    expect(withToken.status).toBe(201);
  });

  it('COPY into an unlocked destination is unaffected by a lock on the destination parent when not overwriting', async () => {
    await lock('/dav/acme/files', { depth: 'infinity' });

    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'COPY',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        Destination: `${baseUrl}/dav/acme/files/copy.txt`,
      },
    });

    expect(response.status).toBe(201);
  });

  it('COPY overwriting an existing destination inside a locked parent requires the token', async () => {
    await dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(FileResource).save(
        manager.getRepository(FileResource).create({
          tenantId: tenant.id,
          collectionId: root.id,
          name: 'copy-target.txt',
          contentType: 'text/plain',
          etag: 'etag-2',
          sizeBytes: 1,
          ownerPrincipalId: alice.principalId,
        }),
      );
      await createOwnerAllAce(manager, 'file', existing.id, alice.principalId);
    });
    const token = await lock('/dav/acme/files', { depth: 'infinity' });

    const withoutToken = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'COPY',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        Destination: `${baseUrl}/dav/acme/files/copy-target.txt`,
        Overwrite: 'T',
      },
    });
    expect(withoutToken.status).toBe(423);

    const withToken = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'COPY',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        Destination: `${baseUrl}/dav/acme/files/copy-target.txt`,
        Overwrite: 'T',
        ...withIf(token),
      },
    });
    expect(withToken.status).toBe(204);
  });

  it('an unrelated lock elsewhere does not block a write to an unlocked resource', async () => {
    await dataSource.transaction(async (manager) => {
      const other = await manager.getRepository(FileResource).save(
        manager.getRepository(FileResource).create({
          tenantId: tenant.id,
          collectionId: root.id,
          name: 'other.txt',
          contentType: 'text/plain',
          etag: 'etag-3',
          sizeBytes: 1,
          ownerPrincipalId: alice.principalId,
        }),
      );
      await createOwnerAllAce(manager, 'file', other.id, alice.principalId);
    });
    await lock('/dav/acme/files/other.txt');

    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'PUT',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'text/plain',
      },
      body: 'unaffected write',
    });

    expect(response.status).toBe(204);
  });

  it('full ACL privilege does not bypass lock enforcement — a fully-privileged principal without the token still gets 423', async () => {
    const aces = dataSource.getRepository(CollectionAce);
    await aces.save(
      aces.create({
        collectionId: root.id,
        principalId: bob.principalId,
        privilege: 'all',
        grantDeny: 'grant',
        position: 1,
      }),
    );
    await lock('/dav/acme/files/doc.txt');

    const response = await fetch(`${baseUrl}/dav/acme/files/doc.txt`, {
      method: 'PUT',
      headers: {
        Authorization: basicAuthHeader('bob', PASSWORD),
        'Content-Type': 'text/plain',
      },
      body: 'attempt',
    });

    expect(response.status).toBe(423);
  });
});
