import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  AddressbookCollection,
  createDataSource,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create } from 'xmlbuilder2';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('addressbook-home route', () => {
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

  async function propfind(
    path: string,
    options: { depth?: string; body?: string; username?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
    };
    if (options.depth !== undefined) {
      headers.Depth = options.depth;
    }
    return fetch(`${baseUrl}${path}`, {
      method: 'PROPFIND',
      headers,
      body: options.body,
    });
  }

  /** Each `<D:response>`'s own `<D:href>` (a direct child, before its `<D:propstat>`). */
  function responseHrefs(xml: string): string[] {
    const root = create(xml).root();
    const hrefs: string[] = [];
    root.each((responseNode) => {
      if (responseNode.node.localName !== 'response') {
        return;
      }
      responseNode.each((child) => {
        if (child.node.localName === 'href') {
          hrefs.push(child.node.textContent ?? '');
        }
      });
    });
    return hrefs;
  }

  it("lists all of the requesting user's addressbooks under their own home collection", async () => {
    const addressbooks = dataSource.getRepository(AddressbookCollection);
    const personal = await addressbooks.save(
      addressbooks.create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Personal',
      }),
    );
    const work = await addressbooks.save(
      addressbooks.create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Work',
      }),
    );

    const response = await propfind(
      `/dav/acme/addressbooks/${alice.principalId}`,
      { depth: '1' },
    );

    expect(response.status).toBe(207);
    const hrefs = responseHrefs(await response.text());
    expect(hrefs).toEqual(
      expect.arrayContaining([
        `/dav/acme/addressbooks/${alice.principalId}`,
        `/dav/acme/addressbooks/${alice.principalId}/${personal.displayName}`,
        `/dav/acme/addressbooks/${alice.principalId}/${work.displayName}`,
      ]),
    );
    expect(hrefs).toHaveLength(3);
  });

  it("does not list another user's addressbooks", async () => {
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    const addressbooks = dataSource.getRepository(AddressbookCollection);
    await addressbooks.save(
      addressbooks.create({
        tenantId: tenant.id,
        ownerPrincipalId: bob.principalId,
        displayName: 'Bob Only',
      }),
    );

    const response = await propfind(
      `/dav/acme/addressbooks/${alice.principalId}`,
      { depth: '1' },
    );

    expect(response.status).toBe(207);
    const hrefs = responseHrefs(await response.text());
    expect(hrefs).toHaveLength(1);
    expect(hrefs).toEqual([`/dav/acme/addressbooks/${alice.principalId}`]);
  });

  it("returns 403 for another user's home collection", async () => {
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });

    const response = await propfind(
      `/dav/acme/addressbooks/${bob.principalId}`,
      { depth: '0' },
    );

    expect(response.status).toBe(403);
  });

  it('returns 403 for a nonexistent userId, indistinguishable from a real other user', async () => {
    const response = await propfind(
      '/dav/acme/addressbooks/00000000-0000-0000-0000-000000000000',
      { depth: '0' },
    );

    expect(response.status).toBe(403);
  });

  it('PROPFIND on a single addressbook reports resourcetype with both DAV:collection and CARDDAV:addressbook', async () => {
    const addressbooks = dataSource.getRepository(AddressbookCollection);
    const personal = await addressbooks.save(
      addressbooks.create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Personal',
      }),
    );

    const requestBody = `<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>`;
    const response = await propfind(
      `/dav/acme/addressbooks/${alice.principalId}/${personal.displayName}`,
      { depth: '0', body: requestBody },
    );

    expect(response.status).toBe(207);
    const body = await response.text();
    expect(body).toContain('<D:collection');
    expect(body).toContain('addressbook');
  });

  it('resolves an addressbook whose display name needs URL-encoding, round-tripped through its Depth:1 href', async () => {
    const addressbooks = dataSource.getRepository(AddressbookCollection);
    await addressbooks.save(
      addressbooks.create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Soccer Team & Friends',
      }),
    );

    const listing = await propfind(
      `/dav/acme/addressbooks/${alice.principalId}`,
      { depth: '1' },
    );
    const hrefs = responseHrefs(await listing.text());
    const childHref = hrefs.find(
      (href) => href !== `/dav/acme/addressbooks/${alice.principalId}`,
    );
    expect(childHref).toBe(
      `/dav/acme/addressbooks/${alice.principalId}/${encodeURIComponent('Soccer Team & Friends')}`,
    );

    const single = await propfind(childHref!, { depth: '0' });
    expect(single.status).toBe(207);
  });

  it('CARD:addressbook-home-set on the user principal points at the correct URL', async () => {
    const requestBody = `<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><C:addressbook-home-set/></D:prop></D:propfind>`;
    const response = await fetch(
      `${baseUrl}/dav/acme/principals/users/${alice.principalId}`,
      {
        method: 'PROPFIND',
        headers: {
          Authorization: basicAuthHeader('alice', PASSWORD),
          Depth: '0',
        },
        body: requestBody,
      },
    );

    expect(response.status).toBe(207);
    const body = await response.text();
    expect(body).toContain(
      `<D:href>/dav/acme/addressbooks/${alice.principalId}</D:href>`,
    );
  });

  it('rejects Depth: infinity with 403', async () => {
    const response = await propfind(
      `/dav/acme/addressbooks/${alice.principalId}`,
      { depth: 'infinity' },
    );

    expect(response.status).toBe(403);
  });
});
