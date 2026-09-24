import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  AddressbookAce,
  AddressbookCollection,
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

function vcard(uid: string, fn = 'Forrest Gump'): string {
  return [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `UID:${uid}`,
    `FN:${fn}`,
    'END:VCARD',
  ].join('\r\n');
}

function syncBody(token = ''): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token>${token}</D:sync-token>
  <D:sync-level>1</D:sync-level>
  <D:prop><D:getetag/></D:prop>
</D:sync-collection>`;
}

function hrefs(xml: string): string[] {
  return [...xml.matchAll(/<D:href>([^<]*)<\/D:href>/g)].map((m) => m[1] ?? '');
}

function syncToken(xml: string): string {
  const match = /<D:sync-token>([^<]*)<\/D:sync-token>/.exec(xml);
  if (!match?.[1]) {
    throw new Error('No sync-token in response');
  }
  return match[1];
}

describe('CardDAV sync-collection REPORT', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
  let addressbook: AddressbookCollection;
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
    addressbook = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Contacts',
      }),
    );
    await createOwnerAllAce(
      dataSource.manager,
      'addressbook',
      addressbook.id,
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

  function bookUrl(): string {
    return `/dav/acme/addressbooks/${alice.principalId}/Contacts`;
  }

  async function put(name: string, body: string): Promise<Response> {
    return fetch(`${baseUrl}${bookUrl()}/${name}`, {
      method: 'PUT',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'text/vcard; charset=utf-8',
      },
      body,
    });
  }

  async function del(name: string): Promise<Response> {
    return fetch(`${baseUrl}${bookUrl()}/${name}`, {
      method: 'DELETE',
      headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
    });
  }

  async function report(
    body: string,
    username = 'alice',
    path = bookUrl(),
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'REPORT',
      headers: {
        Authorization: basicAuthHeader(username, PASSWORD),
        'Content-Type': 'application/xml',
      },
      body,
    });
  }

  it('an initial sync returns every contact with its ETag as 207 Multi-Status', async () => {
    const first = await put('a.vcf', vcard('uid-a'));
    await put('b.vcf', vcard('uid-b'));

    const response = await report(syncBody());
    const body = await response.text();

    expect(response.status).toBe(207);
    expect(hrefs(body)).toEqual([`${bookUrl()}/a.vcf`, `${bookUrl()}/b.vcf`]);
    expect(body).toContain(
      `<D:getetag>${first.headers.get('etag')}</D:getetag>`,
    );
  });

  it('a token round trip reports new, changed and deleted contacts — and nothing once caught up', async () => {
    await put('a.vcf', vcard('uid-a'));
    await put('b.vcf', vcard('uid-b'));
    const token = syncToken(await (await report(syncBody())).text());

    await put('c.vcf', vcard('uid-c'));
    const changed = await put('a.vcf', vcard('uid-a', 'Changed Name'));
    await del('b.vcf');

    const incremental = await (await report(syncBody(token))).text();

    expect(hrefs(incremental).sort()).toEqual([
      `${bookUrl()}/a.vcf`,
      `${bookUrl()}/b.vcf`,
      `${bookUrl()}/c.vcf`,
    ]);
    expect(incremental).toContain(
      `<D:getetag>${changed.headers.get('etag')}</D:getetag>`,
    );
    expect(incremental).toContain('HTTP/1.1 404 Not Found');

    const newToken = syncToken(incremental);
    const caughtUp = await (await report(syncBody(newToken))).text();
    expect(hrefs(caughtUp)).toEqual([]);
    expect(syncToken(caughtUp)).toBe(newToken);
  });

  it('a user without read on the addressbook gets 403', async () => {
    await put('a.vcf', vcard('uid-a'));

    const response = await report(syncBody(), 'bob');

    expect(response.status).toBe(403);
  });

  it('an explicit read grant lets another user sync the addressbook', async () => {
    await put('a.vcf', vcard('uid-a'));
    await dataSource.getRepository(AddressbookAce).save(
      dataSource.getRepository(AddressbookAce).create({
        addressbookId: addressbook.id,
        principalId: bob.principalId,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const response = await report(syncBody(), 'bob');

    expect(response.status).toBe(207);
    expect(hrefs(await response.text())).toEqual([`${bookUrl()}/a.vcf`]);
  });

  it('a nonexistent addressbook returns 404', async () => {
    const response = await report(
      syncBody(),
      'alice',
      `/dav/acme/addressbooks/${alice.principalId}/NoSuchBook`,
    );

    expect(response.status).toBe(404);
  });

  it('a sync-level other than 1 returns 400', async () => {
    const response = await report(
      syncBody().replace('<D:sync-level>1<', '<D:sync-level>infinite<'),
    );

    expect(response.status).toBe(400);
  });

  it('a token that does not decode returns 403 with a valid-sync-token precondition', async () => {
    const response = await report(syncBody('not-a-real-token'));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('valid-sync-token');
  });
});
