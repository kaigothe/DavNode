import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  createDataSource,
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

function principalUrl(tenantSlug: string, principalId: string): string {
  return `/dav/${tenantSlug}/principals/users/${principalId}`;
}

function aclBody(
  entries: Array<{
    principalUrl: string;
    grantDeny: 'grant' | 'deny';
    privileges: string[];
  }>,
): string {
  const aces = entries
    .map(
      (entry) => `
  <D:ace>
    <D:principal><D:href>${entry.principalUrl}</D:href></D:principal>
    <D:${entry.grantDeny}>
      ${entry.privileges.map((p) => `<D:privilege><D:${p}/></D:privilege>`).join('\n      ')}
    </D:${entry.grantDeny}>
  </D:ace>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:acl xmlns:D="DAV:">${aces}\n</D:acl>`;
}

describe('ACL route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
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
    bob = await userService.createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
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
    await dataSource.getRepository(CollectionAce).save(
      dataSource.getRepository(CollectionAce).create({
        collectionId: root.id,
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
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

  async function acl(
    path: string,
    body: string,
    username = 'alice',
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'ACL',
      headers: {
        Authorization: basicAuthHeader(username, PASSWORD),
        'Content-Type': 'application/xml',
      },
      body,
    });
  }

  it('a user without write-acl gets 403 and leaves ACEs unchanged', async () => {
    const before = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: root.id });

    const response = await acl(
      '/dav/acme/files',
      aclBody([
        {
          principalUrl: principalUrl(tenant.slug, bob.principalId),
          grantDeny: 'grant',
          privileges: ['read'],
        },
      ]),
      'bob',
    );

    expect(response.status).toBe(403);
    const after = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: root.id });
    expect(after).toEqual(before);
  });

  it('a valid ACL request fully replaces the non-protected ACEs', async () => {
    const carol = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'carol',
      email: 'carol@example.com',
      password: PASSWORD,
    });

    const first = await acl(
      '/dav/acme/files',
      aclBody([
        {
          principalUrl: principalUrl(tenant.slug, bob.principalId),
          grantDeny: 'grant',
          privileges: ['read'],
        },
      ]),
    );
    expect(first.status).toBe(200);

    const afterFirst = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: root.id, protected: false });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.principalId).toBe(bob.principalId);

    // Second request omits bob's ACE entirely and grants carol write instead.
    const second = await acl(
      '/dav/acme/files',
      aclBody([
        {
          principalUrl: principalUrl(tenant.slug, carol.principalId),
          grantDeny: 'grant',
          privileges: ['write'],
        },
      ]),
    );
    expect(second.status).toBe(200);

    const afterSecond = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: root.id, protected: false });
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.principalId).toBe(carol.principalId);
    expect(afterSecond[0]?.privilege).toBe('write');

    // The protected default-owner ACE is untouched throughout.
    const protectedAces = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: root.id, protected: true });
    expect(protectedAces).toHaveLength(1);
    expect(protectedAces[0]?.privilege).toBe('all');
  });

  it('a request that would modify the default-owner ACE is rejected in full (atomicity)', async () => {
    const response = await acl(
      '/dav/acme/files',
      aclBody([
        {
          // Same principal as the protected ACE, but a conflicting
          // privilege/grantDeny — must be rejected.
          principalUrl: principalUrl(tenant.slug, alice.principalId),
          grantDeny: 'deny',
          privileges: ['read'],
        },
        {
          // An otherwise-valid ACE in the same request — must NOT be
          // applied either, since the whole request is rejected.
          principalUrl: principalUrl(tenant.slug, bob.principalId),
          grantDeny: 'grant',
          privileges: ['read'],
        },
      ]),
    );

    expect(response.status).toBe(403);
    const body = await response.text();
    expect(body).toContain('no-protected-ace-conflict');

    const nonProtected = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: root.id, protected: false });
    expect(nonProtected).toHaveLength(0);

    const protectedAces = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: root.id, protected: true });
    expect(protectedAces).toEqual([
      expect.objectContaining({
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'grant',
      }),
    ]);
  });

  it('a request with an unknown principal URL is rejected', async () => {
    const response = await acl(
      '/dav/acme/files',
      aclBody([
        {
          principalUrl: principalUrl(tenant.slug, '00000000-0000-0000-0000-000000000000'),
          grantDeny: 'grant',
          privileges: ['read'],
        },
      ]),
    );

    expect(response.status).toBe(403);
    const body = await response.text();
    expect(body).toContain('recognized-principal');

    const nonProtected = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: root.id, protected: false });
    expect(nonProtected).toHaveLength(0);
  });

  it('rejects a request containing an <D:inherited> ACE', async () => {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<D:acl xmlns:D="DAV:">
  <D:ace>
    <D:principal><D:href>${principalUrl(tenant.slug, bob.principalId)}</D:href></D:principal>
    <D:inherited><D:href>/dav/acme/files</D:href></D:inherited>
    <D:grant><D:privilege><D:read/></D:privilege></D:grant>
  </D:ace>
</D:acl>`;

    const response = await acl('/dav/acme/files', body);

    expect(response.status).toBe(403);
    const responseBody = await response.text();
    expect(responseBody).toContain('no-ace-conflict');
  });

  it('returns 404 for a non-existent resource', async () => {
    const response = await acl(
      '/dav/acme/files/no-such-file',
      aclBody([
        {
          principalUrl: principalUrl(tenant.slug, bob.principalId),
          grantDeny: 'grant',
          privileges: ['read'],
        },
      ]),
    );

    expect(response.status).toBe(404);
  });
});
