import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  AddressbookAce,
  AddressbookCollection,
  AddressbookLock,
  AddressObject,
  AddressObjectLock,
  createDataSource,
  createOwnerAllAce,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';

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

describe('CardDAV LOCK route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
  let addressbook: AddressbookCollection;
  let contact: AddressObject;
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
      addressbook = await manager.getRepository(AddressbookCollection).save(
        manager.getRepository(AddressbookCollection).create({
          tenantId: tenant.id,
          ownerPrincipalId: alice.principalId,
          displayName: 'Contacts',
        }),
      );
      await createOwnerAllAce(
        manager,
        'addressbook',
        addressbook.id,
        alice.principalId,
      );

      contact = await manager.getRepository(AddressObject).save(
        manager.getRepository(AddressObject).create({
          tenantId: tenant.id,
          addressbookId: addressbook.id,
          name: 'forrest.vcf',
          uid: 'uid-1',
          etag: 'etag-1',
          ownerPrincipalId: alice.principalId,
        }),
      );
      await createOwnerAllAce(
        manager,
        'address-object',
        contact.id,
        alice.principalId,
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

  function contactUrl(): string {
    return `/dav/acme/addressbooks/${alice.principalId}/${addressbook.displayName}/${contact.name}`;
  }

  function addressbookUrl(): string {
    return `/dav/acme/addressbooks/${alice.principalId}/${addressbook.displayName}`;
  }

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

  it('LOCK on an unlocked contact returns 200 with a Lock-Token header and a valid lockdiscovery body', async () => {
    const response = await lock(contactUrl(), {
      owner: 'mailto:alice@example.com',
    });

    expect(response.status).toBe(200);
    const lockToken = response.headers.get('Lock-Token');
    expect(lockToken).toMatch(/^<urn:uuid:[0-9a-f-]{36}>$/);

    const body = await response.text();
    expect(body).toContain('<D:lockdiscovery>');
    expect(body).toContain('<D:activelock');
    expect(body).toContain('<D:exclusive/>');
    expect(body).toContain(lockToken?.slice(1, -1));
    expect(body).toContain('mailto:alice@example.com');

    const stored = await dataSource
      .getRepository(AddressObjectLock)
      .findBy({ addressObjectId: contact.id });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.scope).toBe('exclusive');
  });

  it('a second exclusive LOCK on the same contact returns 423 (conflict detection)', async () => {
    const first = await lock(contactUrl());
    expect(first.status).toBe(200);

    const second = await lock(contactUrl());
    expect(second.status).toBe(423);
    const body = await second.text();
    expect(body).toContain('no-conflicting-lock');

    const stored = await dataSource
      .getRepository(AddressObjectLock)
      .findBy({ addressObjectId: contact.id });
    expect(stored).toHaveLength(1);
  });

  it('two shared LOCKs on the same contact both succeed', async () => {
    const first = await lock(contactUrl(), { scope: 'shared' });
    expect(first.status).toBe(200);

    const second = await lock(contactUrl(), { scope: 'shared' });
    expect(second.status).toBe(200);

    const stored = await dataSource
      .getRepository(AddressObjectLock)
      .findBy({ addressObjectId: contact.id });
    expect(stored).toHaveLength(2);
  });

  it('a shared lock after an existing exclusive lock still conflicts (423)', async () => {
    const first = await lock(contactUrl(), { scope: 'exclusive' });
    expect(first.status).toBe(200);

    const second = await lock(contactUrl(), { scope: 'shared' });
    expect(second.status).toBe(423);
  });

  it('LOCK on the addressbook succeeds and stores an AddressbookLock with the requested depth', async () => {
    const response = await lock(addressbookUrl(), { depth: '0' });
    expect(response.status).toBe(200);

    const stored = await dataSource
      .getRepository(AddressbookLock)
      .findBy({ addressbookId: addressbook.id });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.depth).toBe('zero');
  });

  it('Depth: infinity LOCK on the addressbook also covers its contacts: a second exclusive LOCK on the contact returns 423', async () => {
    const bookLock = await lock(addressbookUrl(), { depth: 'infinity' });
    expect(bookLock.status).toBe(200);

    const contactLock = await lock(contactUrl());

    expect(contactLock.status).toBe(423);
    const stored = await dataSource
      .getRepository(AddressObjectLock)
      .findBy({ addressObjectId: contact.id });
    expect(stored).toHaveLength(0);
  });

  it('Depth: infinity on an addressbook with an already-locked contact returns 423 and creates no new lock anywhere', async () => {
    await dataSource.getRepository(AddressObjectLock).save(
      dataSource.getRepository(AddressObjectLock).create({
        addressObjectId: contact.id,
        principalId: alice.principalId,
        token: 'urn:uuid:11111111-1111-1111-1111-111111111111',
        scope: 'exclusive',
        timeoutSeconds: null,
        expiresAt: null,
        ownerInfo: null,
      }),
    );

    const response = await lock(addressbookUrl(), { depth: 'infinity' });

    expect(response.status).toBe(423);
    const bookLocks = await dataSource
      .getRepository(AddressbookLock)
      .findBy({ addressbookId: addressbook.id });
    expect(bookLocks).toHaveLength(0);
  });

  it('Depth: 1 returns 400', async () => {
    const response = await lock(contactUrl(), { depth: '1' });
    expect(response.status).toBe(400);
  });

  it('a request for a nonexistent contact returns 404', async () => {
    const response = await lock(
      `/dav/acme/addressbooks/${alice.principalId}/${addressbook.displayName}/missing.vcf`,
    );
    expect(response.status).toBe(404);
  });

  it('a user without write-content is refused an exclusive lock (403)', async () => {
    const response = await lock(contactUrl(), {
      username: 'bob',
      scope: 'exclusive',
    });
    expect(response.status).toBe(403);
  });

  it('a shared lock only requires read, unlike exclusive which needs write-content', async () => {
    const aces = dataSource.getRepository(AddressbookAce);
    await aces.save(
      aces.create({
        addressbookId: addressbook.id,
        principalId: bob.principalId,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const shared = await lock(contactUrl(), {
      username: 'bob',
      scope: 'shared',
    });
    expect(shared.status).toBe(200);

    const exclusive = await lock(contactUrl(), {
      username: 'bob',
      scope: 'exclusive',
    });
    expect(exclusive.status).toBe(403);
  });

  it('LOCK without a Timeout header grants Second-3600', async () => {
    const response = await lock(contactUrl());
    expect(response.status).toBe(200);
    expect(response.headers.get('Timeout')).toBe('Second-3600');
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
    const created = await lock(contactUrl());
    const lockToken = created.headers.get('Lock-Token')?.slice(1, -1);
    expect(lockToken).toBeDefined();
    const before = await dataSource
      .getRepository(AddressObjectLock)
      .findOneByOrFail({ addressObjectId: contact.id });

    const response = await refresh(contactUrl(), lockToken!, {
      timeout: 'Second-7200',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Lock-Token')).toBeNull();
    expect(response.headers.get('Timeout')).toBe('Second-7200');

    const after = await dataSource
      .getRepository(AddressObjectLock)
      .findOneByOrFail({ addressObjectId: contact.id });
    expect(after.token).toBe(before.token);
    expect(after.expiresAt!.getTime()).toBeGreaterThan(
      before.expiresAt!.getTime(),
    );
  });

  it('a refresh attempt by a principal other than the lock holder returns 403', async () => {
    const created = await lock(contactUrl());
    const lockToken = created.headers.get('Lock-Token')!.slice(1, -1);

    const response = await refresh(contactUrl(), lockToken, {
      username: 'bob',
    });

    expect(response.status).toBe(403);
  });

  it('refreshing an unknown lock token returns 412', async () => {
    const response = await refresh(
      contactUrl(),
      'urn:uuid:00000000-0000-0000-0000-000000000000',
    );
    expect(response.status).toBe(412);
    const body = await response.text();
    expect(body).toContain('lock-token-matches-request-uri');
  });
});
