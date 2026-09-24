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
const CARDDAV = 'urn:ietf:params:xml:ns:carddav';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function vcard(uid: string, fn: string): string {
  return [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `UID:${uid}`,
    `FN:${fn}`,
    'END:VCARD',
    '',
  ].join('\r\n');
}

function multiget(hrefs: string[], prop = '<D:getetag/><C:address-data/>') {
  return `<?xml version="1.0" encoding="utf-8"?>
<C:addressbook-multiget xmlns:D="DAV:" xmlns:C="${CARDDAV}">
  <D:prop>${prop}</D:prop>
  ${hrefs.map((href) => `<D:href>${href}</D:href>`).join('\n  ')}
</C:addressbook-multiget>`;
}

/** [href, status line or 'propstat'] for each <D:response>. */
function outcomes(xml: string): Array<[string, string]> {
  return [...xml.matchAll(/<D:response>(.*?)<\/D:response>/gs)].map(
    ([, inner]) => [
      /<D:href>([^<]*)<\/D:href>/.exec(inner ?? '')?.[1] ?? '',
      inner?.includes('<D:propstat>')
        ? (/<D:status>([^<]*)<\/D:status>/.exec(inner)?.[1] ?? '')
        : (/<D:status>([^<]*)<\/D:status>/.exec(inner ?? '')?.[1] ?? ''),
    ],
  );
}

describe('CardDAV addressbook-multiget REPORT', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
  let contacts: AddressbookCollection;
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
    const repository = dataSource.getRepository(AddressbookCollection);
    for (const displayName of ['Contacts', 'Other']) {
      const book = await repository.save(
        repository.create({
          tenantId: tenant.id,
          ownerPrincipalId: alice.principalId,
          displayName,
        }),
      );
      await createOwnerAllAce(
        dataSource.manager,
        'addressbook',
        book.id,
        alice.principalId,
      );
      if (displayName === 'Contacts') {
        contacts = book;
      }
    }

    server = createApp(dataSource).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  function bookUrl(name = 'Contacts'): string {
    return `/dav/acme/addressbooks/${alice.principalId}/${name}`;
  }

  async function send(
    method: string,
    path: string,
    body?: string,
    headers: Record<string, string> = {},
    username = 'alice',
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: basicAuthHeader(username, PASSWORD),
        ...(method === 'PUT'
          ? { 'Content-Type': 'text/vcard; charset=utf-8' }
          : { 'Content-Type': 'application/xml' }),
        ...headers,
      },
      body,
    });
  }

  it('returns three 200 responses with each contact’s etag and raw vCard for three existing hrefs', async () => {
    const texts: Record<string, string> = {
      'a.vcf': vcard('uid-a', 'Ann'),
      'b.vcf': vcard('uid-b', 'Ben'),
      'c.vcf': vcard('uid-c', 'Cy'),
    };
    const etags: Record<string, string> = {};
    for (const [name, text] of Object.entries(texts)) {
      const response = await send('PUT', `${bookUrl()}/${name}`, text);
      expect(response.status).toBe(201);
      etags[name] = response.headers.get('etag') ?? '';
    }

    const response = await send(
      'REPORT',
      bookUrl(),
      multiget(Object.keys(texts).map((n) => `${bookUrl()}/${n}`)),
      { Depth: '0' },
    );
    const body = await response.text();

    expect(response.status).toBe(207);
    expect(response.headers.get('content-type')).toContain('xml');
    expect(outcomes(body)).toEqual(
      Object.keys(texts).map((n) => [`${bookUrl()}/${n}`, 'HTTP/1.1 200 OK']),
    );
    for (const [name, text] of Object.entries(texts)) {
      expect(body).toContain(`<D:getetag>${etags[name]}</D:getetag>`);
      // The CardDAV element carries its own namespace declaration.
      expect(body).toContain(`<address-data xmlns="${CARDDAV}">`);
      expect(body).toContain(text.replace(/\r\n/g, '\r\n'));
    }
  });

  it('answers a contact deleted in the meantime with 404 and leaves the others 200', async () => {
    await send('PUT', `${bookUrl()}/a.vcf`, vcard('uid-a', 'Ann'));
    await send('PUT', `${bookUrl()}/b.vcf`, vcard('uid-b', 'Ben'));
    await send('PUT', `${bookUrl()}/c.vcf`, vcard('uid-c', 'Cy'));
    expect((await send('DELETE', `${bookUrl()}/b.vcf`)).status).toBe(204);

    const response = await send(
      'REPORT',
      bookUrl(),
      multiget(['a.vcf', 'b.vcf', 'c.vcf'].map((n) => `${bookUrl()}/${n}`)),
      { Depth: '0' },
    );

    expect(response.status).toBe(207);
    expect(outcomes(await response.text())).toEqual([
      [`${bookUrl()}/a.vcf`, 'HTTP/1.1 200 OK'],
      [`${bookUrl()}/b.vcf`, 'HTTP/1.1 404 Not Found'],
      [`${bookUrl()}/c.vcf`, 'HTTP/1.1 200 OK'],
    ]);
  });

  it('answers an href into another addressbook with 404 and does not leak its contact', async () => {
    await send('PUT', `${bookUrl()}/a.vcf`, vcard('uid-a', 'Ann'));
    await send(
      'PUT',
      `${bookUrl('Other')}/secret.vcf`,
      vcard('uid-s', 'TopSecret'),
    );

    const response = await send(
      'REPORT',
      bookUrl(),
      multiget([`${bookUrl('Other')}/secret.vcf`, `${bookUrl()}/a.vcf`]),
      { Depth: '0' },
    );
    const body = await response.text();

    expect(response.status).toBe(207);
    expect(outcomes(body)).toEqual([
      [`${bookUrl('Other')}/secret.vcf`, 'HTTP/1.1 404 Not Found'],
      [`${bookUrl()}/a.vcf`, 'HTTP/1.1 200 OK'],
    ]);
    expect(body).not.toContain('TopSecret');
  });

  it('works with a trailing slash on the Request-URI and without any Depth header', async () => {
    await send('PUT', `${bookUrl()}/a.vcf`, vcard('uid-a', 'Ann'));

    const response = await send(
      'REPORT',
      `${bookUrl()}/`,
      multiget([`${bookUrl()}/a.vcf`]),
    );

    expect(response.status).toBe(207);
    expect(outcomes(await response.text())).toEqual([
      [`${bookUrl()}/a.vcf`, 'HTTP/1.1 200 OK'],
    ]);
  });

  it('is 403 for a user without read on the addressbook and 200 once read is granted', async () => {
    await send('PUT', `${bookUrl()}/a.vcf`, vcard('uid-a', 'Ann'));
    const body = multiget([`${bookUrl()}/a.vcf`]);

    const denied = await send('REPORT', bookUrl(), body, {}, 'bob');
    expect(denied.status).toBe(403);
    expect(await denied.text()).toBe('');

    await dataSource.getRepository(AddressbookAce).save(
      dataSource.getRepository(AddressbookAce).create({
        addressbookId: contacts.id,
        principalId: bob.principalId,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );
    const granted = await send('REPORT', bookUrl(), body, {}, 'bob');
    expect(granted.status).toBe(207);
    expect(outcomes(await granted.text())).toEqual([
      [`${bookUrl()}/a.vcf`, 'HTTP/1.1 200 OK'],
    ]);
  });

  it('is 404 for an unknown addressbook and 400 for a body without hrefs', async () => {
    const missing = await send(
      'REPORT',
      bookUrl('NoSuchBook'),
      multiget([`${bookUrl()}/a.vcf`]),
    );
    expect(missing.status).toBe(404);

    const noHrefs = await send('REPORT', bookUrl(), multiget([]));
    expect(noHrefs.status).toBe(400);
  });
});
