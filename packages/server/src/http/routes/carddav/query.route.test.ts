import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  AddressbookCollection,
  createDataSource,
  createOwnerAllAce,
  TenantService,
  UserService,
  type DataSource,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';

const PASSWORD = 'correct horse battery staple';
const CARDDAV = 'urn:ietf:params:xml:ns:carddav';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function vcard(uid: string, fn: string, extra: string[] = []): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${uid}`,
    `FN:${fn}`,
    ...extra,
    'END:VCARD',
    '',
  ].join('\r\n');
}

function query(filter: string, limit?: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<C:addressbook-query xmlns:D="DAV:" xmlns:C="${CARDDAV}">
  <D:prop><D:getetag/><C:address-data/></D:prop>
  ${filter}
  ${limit === undefined ? '' : `<C:limit><C:nresults>${limit}</C:nresults></C:limit>`}
</C:addressbook-query>`;
}

const EMAIL_CONTAINS = (text: string) =>
  `<C:filter><C:prop-filter name="EMAIL"><C:text-match match-type="contains">${text}</C:text-match></C:prop-filter></C:filter>`;

function hrefs(xml: string): string[] {
  return [...xml.matchAll(/<D:href>([^<]*)<\/D:href>/g)].map((m) => m[1] ?? '');
}

describe('CardDAV addressbook-query REPORT', () => {
  let dataSource: DataSource;
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

    const tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    alice = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    const repository = dataSource.getRepository(AddressbookCollection);
    const book = await repository.save(
      repository.create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Contacts',
      }),
    );
    await createOwnerAllAce(
      dataSource.manager,
      'addressbook',
      book.id,
      alice.principalId,
    );

    server = createApp(dataSource).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  const bookUrl = () => `/dav/acme/addressbooks/${alice.principalId}/Contacts`;

  async function put(name: string, body: string): Promise<void> {
    const response = await fetch(`${baseUrl}${bookUrl()}/${name}`, {
      method: 'PUT',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'text/vcard; charset=utf-8',
      },
      body,
    });
    expect(response.status).toBe(201);
  }

  async function report(
    body: string,
    headers: Record<string, string> = { Depth: '1' },
  ): Promise<Response> {
    return fetch(`${baseUrl}${bookUrl()}`, {
      method: 'REPORT',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        'Content-Type': 'application/xml',
        ...headers,
      },
      body,
    });
  }

  beforeEach(async () => {
    await put('a.vcf', vcard('uid-a', 'Ann', ['EMAIL:ann@Example.com']));
    await put('b.vcf', vcard('uid-b', 'Ben', ['EMAIL:ben@other.net']));
    await put('c.vcf', vcard('uid-c', 'Cy', ['EMAIL:cy@EXAMPLE.org']));
  });

  it('finds contacts by a case-insensitive substring of a property, as 207 with etag and address-data', async () => {
    const response = await report(query(EMAIL_CONTAINS('EXAMPLE')));
    const body = await response.text();

    expect(response.status).toBe(207);
    expect(hrefs(body)).toEqual([`${bookUrl()}/a.vcf`, `${bookUrl()}/c.vcf`]);
    expect(body).toContain('FN:Ann');
    expect(body).toContain('FN:Cy');
    expect(body).not.toContain('FN:Ben');
    expect(body).toContain(`<address-data xmlns="${CARDDAV}">`);
  });

  it('passes the Depth header through: 1 and infinity search, 0 and none give an empty multistatus', async () => {
    const filter = EMAIL_CONTAINS('example');

    for (const depth of ['1', 'infinity']) {
      const body = await (await report(query(filter), { Depth: depth })).text();
      expect(hrefs(body), depth).toHaveLength(2);
    }
    for (const headers of [{ Depth: '0' }, {}]) {
      const response = await report(query(filter), headers);
      expect(response.status).toBe(207);
      expect(hrefs(await response.text())).toEqual([]);
    }
    expect((await report(query(filter), { Depth: '7' })).status).toBe(400);
  });

  it('answers a truncated result with the matches and a 507 number-of-matches-within-limits for the Request-URI', async () => {
    const response = await report(query('<C:filter/>', 2));
    const body = await response.text();

    expect(response.status).toBe(207);
    expect(hrefs(body)).toEqual([
      bookUrl(),
      `${bookUrl()}/a.vcf`,
      `${bookUrl()}/b.vcf`,
    ]);
    expect(body).toContain('HTTP/1.1 507 Insufficient Storage');
    expect(body).toContain('<D:number-of-matches-within-limits/>');
  });

  it('refuses a filter on a property outside the index with 403 supported-filter', async () => {
    const response = await report(
      query(
        '<C:filter><C:prop-filter name="GENDER"><C:is-not-defined/></C:prop-filter></C:filter>',
      ),
    );

    expect(response.status).toBe(403);
    const body = await response.text();
    expect(body).toContain('supported-filter');
    expect(body).toContain('name="GENDER"');
  });

  it('is 404 for an unknown addressbook and 400 for a body without a filter', async () => {
    const missing = await fetch(
      `${baseUrl}/dav/acme/addressbooks/${alice.principalId}/NoSuchBook`,
      {
        method: 'REPORT',
        headers: {
          Authorization: basicAuthHeader('alice', PASSWORD),
          'Content-Type': 'application/xml',
          Depth: '1',
        },
        body: query('<C:filter/>'),
      },
    );
    expect(missing.status).toBe(404);

    const noFilter = await report(query(''));
    expect(noFilter.status).toBe(400);
  });

  describe('vCard 3.0 clients (M11)', () => {
    const quotedPrintableCard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'UID:uid-qp',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=BCrgen M=C3=BCller',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen;;;',
      'TEL;TYPE=HOME;TYPE=VOICE:+49 30 1234',
      'EMAIL;TYPE=INTERNET,PREF:juergen@example.com',
      'X-ABADR:de',
      'X-ABUID:5C1B6A52-0C22-4C13-9B6A-6D2C7C1A0000:ABPerson',
      'X-ABRELATEDNAMES;type=Mother;X-ABLabel=_$!<Mother>!$_:Maria',
      'END:VCARD',
      '',
    ].join('\r\n');

    const fnContains = (text: string) =>
      `<C:filter><C:prop-filter name="FN"><C:text-match match-type="contains">${text}</C:text-match></C:prop-filter></C:filter>`;

    it('finds a contact whose name was sent quoted-printable by its decoded text', async () => {
      await put('qp.vcf', quotedPrintableCard);

      const response = await report(query(fnContains('müller')));

      expect(response.status).toBe(207);
      expect(hrefs(await response.text())).toEqual([`${bookUrl()}/qp.vcf`]);
    });

    it('does not match the encoded form', async () => {
      await put('qp.vcf', quotedPrintableCard);

      const response = await report(query(fnContains('C3=BC')));

      expect(hrefs(await response.text())).toEqual([]);
    });

    it('returns the vCard byte for byte on GET, extensions and encoding included', async () => {
      await put('qp.vcf', quotedPrintableCard);

      const response = await fetch(`${baseUrl}${bookUrl()}/qp.vcf`, {
        headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(quotedPrintableCard);
    });

    it('rejects a vCard with an unsupported VERSION with 4xx instead of storing it', async () => {
      const response = await fetch(`${baseUrl}${bookUrl()}/old.vcf`, {
        method: 'PUT',
        headers: {
          Authorization: basicAuthHeader('alice', PASSWORD),
          'Content-Type': 'text/vcard',
        },
        body: quotedPrintableCard.replace('VERSION:3.0', 'VERSION:2.1'),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });
});
