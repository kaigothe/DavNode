import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  AddressbookAce,
  AddressbookCollection,
  Collection,
  createDataSource,
  createOwnerAllAce,
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

const ADDRESSBOOK_MKCOL_BODY = `<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:set>
    <D:prop>
      <D:resourcetype><D:collection/><C:addressbook/></D:resourcetype>
      <C:addressbook-description>Work contacts</C:addressbook-description>
    </D:prop>
  </D:set>
</D:mkcol>`;

describe('addressbook-mkcol route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
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
    alice = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
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

  async function mkcol(
    path: string,
    options: { body?: string; username?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/xml; charset=utf-8';
    }
    return fetch(`${baseUrl}${path}`, {
      method: 'MKCOL',
      headers,
      body: options.body,
    });
  }

  it("creates a new, PROPFIND-visible addressbook under the owner's own home", async () => {
    const response = await mkcol(
      `/dav/acme/addressbooks/${alice.principalId}/Work`,
      { body: ADDRESSBOOK_MKCOL_BODY },
    );

    expect(response.status).toBe(201);
    const body = await response.text();
    expect(body).toContain('<D:mkcol-response');
    expect(body).toContain('HTTP/1.1 200 OK');

    const created = await dataSource
      .getRepository(AddressbookCollection)
      .findOneByOrFail({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Work',
      });
    expect(created.description).toBe('Work contacts');

    const propfindResponse = await fetch(
      `${baseUrl}/dav/acme/addressbooks/${alice.principalId}/Work`,
      {
        method: 'PROPFIND',
        headers: {
          Authorization: basicAuthHeader('alice', PASSWORD),
          Depth: '0',
        },
      },
    );
    expect(propfindResponse.status).toBe(207);
  });

  it('creates a default-owner ACE so the owner is never locked out (RFC 3744 default-deny)', async () => {
    await mkcol(`/dav/acme/addressbooks/${alice.principalId}/Work`, {
      body: ADDRESSBOOK_MKCOL_BODY,
    });

    const created = await dataSource
      .getRepository(AddressbookCollection)
      .findOneByOrFail({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Work',
      });
    const aces = await dataSource
      .getRepository(AddressbookAce)
      .findBy({ addressbookId: created.id });

    expect(aces).toEqual([
      expect.objectContaining({
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
      }),
    ]);
  });

  it("returns 403 for an Extended MKCOL outside the requester's own home", async () => {
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });

    const response = await mkcol(
      `/dav/acme/addressbooks/${bob.principalId}/Work`,
      { body: ADDRESSBOOK_MKCOL_BODY },
    );

    expect(response.status).toBe(403);
    await expect(
      dataSource.getRepository(AddressbookCollection).findOneBy({
        tenantId: tenant.id,
        ownerPrincipalId: bob.principalId,
      }),
    ).resolves.toBeNull();
  });

  it('rejects a body without CARDDAV:addressbook in resourcetype with 415', async () => {
    const plainBody = `<D:mkcol xmlns:D="DAV:"><D:set><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:set></D:mkcol>`;

    const response = await mkcol(
      `/dav/acme/addressbooks/${alice.principalId}/Work`,
      { body: plainBody },
    );

    expect(response.status).toBe(415);
  });

  it('rejects a missing body with 415', async () => {
    const response = await mkcol(
      `/dav/acme/addressbooks/${alice.principalId}/Work`,
    );

    expect(response.status).toBe(415);
  });

  it('returns 405 for a duplicate addressbook name under the same owner', async () => {
    await mkcol(`/dav/acme/addressbooks/${alice.principalId}/Work`, {
      body: ADDRESSBOOK_MKCOL_BODY,
    });

    const response = await mkcol(
      `/dav/acme/addressbooks/${alice.principalId}/Work`,
      { body: ADDRESSBOOK_MKCOL_BODY },
    );

    expect(response.status).toBe(405);
  });

  it('regular MKCOL in the WebDAV file tree still behaves as in M2 (regression check)', async () => {
    const root = await dataSource.getRepository(Collection).save(
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

    const emptyBodyResponse = await fetch(
      `${baseUrl}/dav/acme/files/new-folder`,
      {
        method: 'MKCOL',
        headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
      },
    );
    expect(emptyBodyResponse.status).toBe(201);

    const rejectedBodyResponse = await fetch(
      `${baseUrl}/dav/acme/files/another-folder`,
      {
        method: 'MKCOL',
        headers: {
          Authorization: basicAuthHeader('alice', PASSWORD),
          'Content-Type': 'application/xml',
        },
        body: ADDRESSBOOK_MKCOL_BODY,
      },
    );
    expect(rejectedBodyResponse.status).toBe(415);
  });
});
