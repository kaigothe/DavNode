import type { DataSource } from 'typeorm';
import { create } from 'xmlbuilder2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  AddressbookAce,
  AddressbookCollection,
  AddressObject,
  AddressObjectAce,
  AddressObjectContent,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import type { ReportContext } from '../webdav/report-registry.js';
import {
  AddressbookMultigetReportHandler,
  parseAddressbookMultigetRequestBody,
} from './addressbook-multiget-report.js';

const PASSWORD = 'correct horse battery staple';
const CARDDAV = 'urn:ietf:params:xml:ns:carddav';

function vcard(uid: string, fn: string, version = '3.0'): string {
  return [
    'BEGIN:VCARD',
    `VERSION:${version}`,
    `UID:${uid}`,
    `FN:${fn}`,
    'EMAIL:someone@example.com',
    'END:VCARD',
    '',
  ].join('\r\n');
}

interface ParsedResponse {
  href: string;
  status: string | undefined;
  errors: string[];
  propstats: Array<{
    status: string;
    props: Array<{ ns: string | null; name: string; value: string }>;
  }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- test-only DOM walking over xmlbuilder2's untyped node tree. */
function kids(node: any): any[] {
  return Array.from(node.childNodes as ArrayLike<any>).filter(
    (child: any) => child.nodeType === 1,
  );
}

/** Parses a multistatus body with a real XML parser, so namespaces and structure are what a client sees. */
function parseMultistatus(xml: string): ParsedResponse[] {
  const root: any = create(xml).root().node;
  expect(root.localName).toBe('multistatus');
  expect(root.namespaceURI).toBe('DAV:');
  return kids(root)
    .filter((child) => child.localName === 'response')
    .map((response) => {
      const parts = kids(response);
      const error = parts.find((part) => part.localName === 'error');
      return {
        href: parts.find((part) => part.localName === 'href').textContent,
        status: parts.find((part) => part.localName === 'status')?.textContent,
        errors: error
          ? kids(error).map((part) => `${part.namespaceURI}${part.localName}`)
          : [],
        propstats: parts
          .filter((part) => part.localName === 'propstat')
          .map((propstat) => {
            const inner = kids(propstat);
            const prop = inner.find((part) => part.localName === 'prop');
            return {
              status: inner.find((part) => part.localName === 'status')
                .textContent,
              props: kids(prop).map((property) => ({
                ns: property.namespaceURI,
                name: property.localName,
                value: property.textContent,
              })),
            };
          }),
      };
    });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function multigetBody(hrefs: string[], prop = '<D:getetag/><C:address-data/>') {
  return `<?xml version="1.0" encoding="utf-8"?>
<C:addressbook-multiget xmlns:D="DAV:" xmlns:C="${CARDDAV}">
  <D:prop>${prop}</D:prop>
  ${hrefs.map((href) => `<D:href>${href}</D:href>`).join('\n  ')}
</C:addressbook-multiget>`;
}

describe('parseAddressbookMultigetRequestBody', () => {
  it('collects the hrefs in order and the property selection', () => {
    const parsed = parseAddressbookMultigetRequestBody(
      multigetBody(['/a', ' /b ']),
    );

    expect(parsed.hrefs).toEqual(['/a', '/b']);
    expect(parsed.selection.kind).toBe('prop');
  });

  it('rejects a body without any DAV:href', () => {
    expect(() => parseAddressbookMultigetRequestBody(multigetBody([]))).toThrow(
      /no DAV:href/,
    );
  });

  it('rejects another root element and malformed XML', () => {
    expect(() =>
      parseAddressbookMultigetRequestBody(
        '<D:sync-collection xmlns:D="DAV:"/>',
      ),
    ).toThrow(/addressbook-multiget/);
    expect(() => parseAddressbookMultigetRequestBody('<not-xml')).toThrow();
  });
});

describe('AddressbookMultigetReportHandler', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let bob: Principal;
  let carol: Principal;
  let contacts: AddressbookCollection;
  let other: AddressbookCollection;
  let bobsBook: AddressbookCollection;
  let handler: AddressbookMultigetReportHandler;

  function bookUrl(book: AddressbookCollection): string {
    return `/dav/acme/addressbooks/${book.ownerPrincipalId}/${encodeURIComponent(book.displayName)}`;
  }

  function context(overrides: Partial<ReportContext> = {}): ReportContext {
    return {
      tenant,
      principal: alice,
      manager: dataSource.manager,
      segments: ['addressbooks', alice.id, 'Contacts'],
      ...overrides,
    };
  }

  async function addBook(
    owner: Principal,
    displayName: string,
    grantOwnerAll = true,
  ): Promise<AddressbookCollection> {
    const book = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        displayName,
      }),
    );
    if (grantOwnerAll) {
      await dataSource.getRepository(AddressbookAce).save(
        dataSource.getRepository(AddressbookAce).create({
          addressbookId: book.id,
          principalId: owner.id,
          privilege: 'all',
          grantDeny: 'grant',
          protected: true,
          position: 0,
        }),
      );
    }
    return book;
  }

  async function addContact(
    book: AddressbookCollection,
    name: string,
    text: string,
  ): Promise<AddressObject> {
    const contact = await dataSource.getRepository(AddressObject).save(
      dataSource.getRepository(AddressObject).create({
        tenantId: tenant.id,
        addressbookId: book.id,
        name,
        uid: `uid-${name}`,
        etag: `"etag-${name}"`,
        ownerPrincipalId: book.ownerPrincipalId,
      }),
    );
    await dataSource.getRepository(AddressObjectContent).save(
      dataSource.getRepository(AddressObjectContent).create({
        addressObjectId: contact.id,
        vcardData: text,
      }),
    );
    return contact;
  }

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    const userService = new UserService(dataSource);
    const principals = dataSource.getRepository(Principal);
    const createUser = async (username: string): Promise<Principal> => {
      const user = await userService.createUser({
        tenantId: tenant.id,
        username,
        email: `${username}@example.com`,
        password: PASSWORD,
      });
      return principals.findOneByOrFail({ id: user.principalId });
    };
    alice = await createUser('alice');
    bob = await createUser('bob');
    carol = await createUser('carol');

    contacts = await addBook(alice, 'Contacts');
    other = await addBook(alice, 'Other');
    bobsBook = await addBook(bob, 'BobBook');
    handler = new AddressbookMultigetReportHandler();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('returns a 200 with etag and the raw vCard as CARDDAV:address-data for each of three existing hrefs', async () => {
    const texts = {
      'a.vcf': vcard('uid-a', 'Ann'),
      'b.vcf': vcard('uid-b', 'Ben & Co <ok>'),
      'c.vcf': vcard('uid-c', 'Cy'),
    };
    for (const [name, text] of Object.entries(texts)) {
      await addContact(contacts, name, text);
    }

    const result = await handler.handle(
      multigetBody(Object.keys(texts).map((n) => `${bookUrl(contacts)}/${n}`)),
      context(),
    );

    expect(result.status).toBe(207);
    const responses = parseMultistatus(result.body);
    expect(responses.map((r) => r.href)).toEqual(
      Object.keys(texts).map((n) => `${bookUrl(contacts)}/${n}`),
    );
    for (const [index, name] of Object.keys(texts).entries()) {
      const [propstat] = responses[index].propstats;
      expect(propstat.status).toBe('HTTP/1.1 200 OK');
      const etag = propstat.props.find((p) => p.name === 'getetag');
      const data = propstat.props.find((p) => p.name === 'address-data');
      expect(etag?.value).toBe(`"etag-${name}"`);
      expect(data?.ns).toBe(CARDDAV);
      // XML parsers normalize CRLF to LF, which RFC 6352 §10.4 allows.
      expect(data?.value.replace(/\r\n/g, '\n')).toBe(
        texts[name as keyof typeof texts].replace(/\r\n/g, '\n'),
      );
    }
  });

  it('answers a deleted contact with a bare 404 and keeps the others 200', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));
    const gone = await addContact(contacts, 'gone.vcf', vcard('uid-g', 'Gone'));
    await dataSource.getRepository(AddressObject).delete({ id: gone.id });

    const result = await handler.handle(
      multigetBody([
        `${bookUrl(contacts)}/a.vcf`,
        `${bookUrl(contacts)}/gone.vcf`,
      ]),
      context(),
    );

    const [ok, missing] = parseMultistatus(result.body);
    expect(ok.propstats[0].status).toBe('HTTP/1.1 200 OK');
    expect(missing).toMatchObject({
      href: `${bookUrl(contacts)}/gone.vcf`,
      status: 'HTTP/1.1 404 Not Found',
      propstats: [],
    });
  });

  it('answers hrefs into another addressbook — same user or another user — with 404 and leaks none of their data', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));
    await addContact(other, 'secret.vcf', vcard('uid-s', 'TopSecret'));
    await addContact(bobsBook, 'bobs.vcf', vcard('uid-b', 'BobsSecret'));
    // Same file name as a contact that does exist here: must not resolve either.
    await addContact(other, 'a.vcf', vcard('uid-a2', 'OtherAnn'));

    const result = await handler.handle(
      multigetBody([
        `${bookUrl(other)}/secret.vcf`,
        `${bookUrl(bobsBook)}/bobs.vcf`,
        `${bookUrl(other)}/a.vcf`,
        `${bookUrl(contacts)}/a.vcf`,
      ]),
      context(),
    );

    const responses = parseMultistatus(result.body);
    expect(responses.map((r) => r.status ?? 'propstat')).toEqual([
      'HTTP/1.1 404 Not Found',
      'HTTP/1.1 404 Not Found',
      'HTTP/1.1 404 Not Found',
      'propstat',
    ]);
    expect(result.body).not.toContain('TopSecret');
    expect(result.body).not.toContain('BobsSecret');
    expect(result.body).not.toContain('OtherAnn');
    expect(result.body).toContain('Ann');
  });

  it('resolves only exact one-segment-below hrefs: traversal, the addressbook itself, deeper paths and foreign tenants are 404', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));
    await addContact(other, 'secret.vcf', vcard('uid-s', 'TopSecret'));

    const result = await handler.handle(
      multigetBody([
        `${bookUrl(contacts)}/../Other/secret.vcf`,
        `${bookUrl(contacts)}%2F..%2FOther%2Fsecret.vcf`,
        bookUrl(contacts),
        `${bookUrl(contacts)}/`,
        `${bookUrl(contacts)}/a.vcf/extra`,
        `${bookUrl(contacts)}/a.vcf/`,
        `/dav/other-tenant/addressbooks/${alice.id}/Contacts/a.vcf`,
        'not a url at all %zz',
        'http://',
      ]),
      context(),
    );

    const responses = parseMultistatus(result.body);
    expect(responses).toHaveLength(9);
    expect(responses.every((r) => r.status === 'HTTP/1.1 404 Not Found')).toBe(
      true,
    );
    expect(result.body).not.toContain('TopSecret');
    // The client's own href is echoed back for a 404.
    expect(responses[0].href).toBe(`${bookUrl(contacts)}/../Other/secret.vcf`);
  });

  it('accepts absolute URLs and percent-encoded names, answering with the canonical href', async () => {
    await addContact(contacts, 'Jane Doe & Co.vcf', vcard('uid-j', 'Jane'));

    const encoded = `${bookUrl(contacts)}/${encodeURIComponent('Jane Doe & Co.vcf')}`;
    const result = await handler.handle(
      multigetBody([`http://dav.example.com:8080${encoded}`]),
      context(),
    );

    const [response] = parseMultistatus(result.body);
    expect(response.href).toBe(encoded);
    expect(response.propstats[0].status).toBe('HTTP/1.1 200 OK');
  });

  it('answers a repeated href only once', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));
    const href = `${bookUrl(contacts)}/a.vcf`;

    const result = await handler.handle(
      multigetBody([href, href, `http://x${href}`]),
      context(),
    );

    expect(parseMultistatus(result.body)).toHaveLength(1);
  });

  it('accepts a Request-URI with a trailing slash', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));

    const result = await handler.handle(
      multigetBody([`${bookUrl(contacts)}/a.vcf`]),
      context({ segments: ['addressbooks', alice.id, 'Contacts', ''] }),
    );

    expect(result.status).toBe(207);
  });

  it('is 404 for a Request-URI that is not an addressbook, does not exist, or has a non-UUID owner', async () => {
    const body = multigetBody([`${bookUrl(contacts)}/a.vcf`]);
    for (const segments of [
      ['addressbooks', alice.id],
      ['addressbooks', alice.id, 'Contacts', 'a.vcf'],
      ['addressbooks', alice.id, 'NoSuchBook'],
      ['addressbooks', 'not-a-uuid', 'Contacts'],
      ['files', 'Contacts'],
    ]) {
      const result = await handler.handle(body, context({ segments }));
      expect(result.status, segments.join('/')).toBe(404);
    }
  });

  it('is 403 with an empty body for a principal without read on the addressbook', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));

    const result = await handler.handle(
      multigetBody([`${bookUrl(contacts)}/a.vcf`]),
      context({ principal: carol }),
    );

    expect(result).toEqual({ status: 403, body: '' });
  });

  it("answers a contact whose own ACE denies read with 403 while the addressbook's grant still serves the others", async () => {
    await dataSource.getRepository(AddressbookAce).save(
      dataSource.getRepository(AddressbookAce).create({
        addressbookId: contacts.id,
        principalId: bob.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );
    await addContact(contacts, 'open.vcf', vcard('uid-o', 'Open'));
    const hidden = await addContact(
      contacts,
      'hidden.vcf',
      vcard('uid-h', 'Hidden'),
    );
    await dataSource.getRepository(AddressObjectAce).save(
      dataSource.getRepository(AddressObjectAce).create({
        addressObjectId: hidden.id,
        principalId: bob.id,
        privilege: 'read',
        grantDeny: 'deny',
        position: 0,
      }),
    );

    const result = await handler.handle(
      multigetBody([
        `${bookUrl(contacts)}/open.vcf`,
        `${bookUrl(contacts)}/hidden.vcf`,
      ]),
      context({ principal: bob }),
    );

    const [open, denied] = parseMultistatus(result.body);
    expect(open.propstats[0].status).toBe('HTTP/1.1 200 OK');
    expect(denied.status).toBe('HTTP/1.1 403 Forbidden');
    expect(result.body).not.toContain('Hidden');
  });

  it('is 403 with a supported-address-data precondition for an unsupported content-type or version', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));
    const href = `${bookUrl(contacts)}/a.vcf`;

    for (const attributes of ['content-type="text/x-other"', 'version="2.1"']) {
      const result = await handler.handle(
        multigetBody([href], `<D:getetag/><C:address-data ${attributes}/>`),
        context(),
      );
      expect(result.status, attributes).toBe(403);
      const error: any = create(result.body).root().node; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(`${error.namespaceURI}${error.localName}`).toBe('DAV:error');
      expect(kids(error).map((c) => `${c.namespaceURI}${c.localName}`)).toEqual(
        [`${CARDDAV}supported-address-data`],
      );
    }
  });

  it('answers an explicitly requested version the contact is not stored in with 415 + supported-address-data-conversion — per contact, without conversion', async () => {
    await addContact(contacts, 'v3.vcf', vcard('uid-3', 'Three', '3.0'));
    await addContact(contacts, 'v4.vcf', vcard('uid-4', 'Four', '4.0'));

    const result = await handler.handle(
      multigetBody(
        [`${bookUrl(contacts)}/v3.vcf`, `${bookUrl(contacts)}/v4.vcf`],
        '<D:getetag/><C:address-data content-type="text/vcard" version="4.0"/>',
      ),
      context(),
    );

    const [three, four] = parseMultistatus(result.body);
    expect(three).toMatchObject({
      status: 'HTTP/1.1 415 Unsupported Media Type',
      errors: [`${CARDDAV}supported-address-data-conversion`],
      propstats: [],
    });
    expect(four.propstats[0].status).toBe('HTTP/1.1 200 OK');
    expect(result.body).not.toContain('Three');
  });

  it('serves each contact as stored when address-data names no version', async () => {
    await addContact(contacts, 'v3.vcf', vcard('uid-3', 'Three', '3.0'));
    await addContact(contacts, 'v4.vcf', vcard('uid-4', 'Four', '4.0'));

    const result = await handler.handle(
      multigetBody(
        [`${bookUrl(contacts)}/v3.vcf`, `${bookUrl(contacts)}/v4.vcf`],
        '<C:address-data/>',
      ),
      context(),
    );

    const [three, four] = parseMultistatus(result.body);
    expect(three.propstats[0].props[0].value).toContain('VERSION:3.0');
    expect(four.propstats[0].props[0].value).toContain('VERSION:4.0');
  });

  it('honours partial retrieval: only the selected vCard properties come back', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));

    const result = await handler.handle(
      multigetBody(
        [`${bookUrl(contacts)}/a.vcf`],
        '<C:address-data><C:prop name="FN"/><C:prop name="EMAIL" novalue="yes"/></C:address-data>',
      ),
      context(),
    );

    const [response] = parseMultistatus(result.body);
    const data = response.propstats[0].props[0].value.replace(/\r\n/g, '\n');
    expect(data).toBe('BEGIN:VCARD\nVERSION:3.0\nFN:Ann\nEMAIL:\nEND:VCARD\n');
  });

  it('reports an unknown property as a 404 propstat next to the 200 one', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));

    const result = await handler.handle(
      multigetBody(
        [`${bookUrl(contacts)}/a.vcf`],
        '<D:getetag/><D:getcontentlength/>',
      ),
      context(),
    );

    const [response] = parseMultistatus(result.body);
    expect(response.propstats.map((p) => p.status)).toEqual([
      'HTTP/1.1 200 OK',
      'HTTP/1.1 404 Not Found',
    ]);
  });

  it('supports allprop and propname like PROPFIND (live properties, no address-data)', async () => {
    await addContact(contacts, 'a.vcf', vcard('uid-a', 'Ann'));
    const href = `${bookUrl(contacts)}/a.vcf`;
    const wrap = (inner: string) =>
      `<C:addressbook-multiget xmlns:D="DAV:" xmlns:C="${CARDDAV}">${inner}<D:href>${href}</D:href></C:addressbook-multiget>`;

    const all = parseMultistatus(
      (await handler.handle(wrap('<D:allprop/>'), context())).body,
    );
    const names = parseMultistatus(
      (await handler.handle(wrap('<D:propname/>'), context())).body,
    );

    const allNames = all[0].propstats[0].props.map((p) => p.name);
    expect(allNames).toContain('getetag');
    expect(allNames).not.toContain('address-data');
    expect(
      all[0].propstats[0].props.find((p) => p.name === 'getetag')?.value,
    ).toBe('"etag-a.vcf"');
    expect(names[0].propstats[0].props.map((p) => p.name)).toEqual(allNames);
    expect(names[0].propstats[0].props.every((p) => p.value === '')).toBe(true);
  });

  it('is 400 for a malformed body, a wrong root element, or no hrefs', async () => {
    for (const body of [
      '<not-xml',
      '<D:sync-collection xmlns:D="DAV:"/>',
      multigetBody([]),
    ]) {
      const result = await handler.handle(body, context());
      expect(result.status, body).toBe(400);
    }
  });

  it('never emits XML-illegal characters, even from a stored vCard that contains them', async () => {
    await addContact(
      contacts,
      'evil.vcf',
      'BEGIN:VCARD\r\nVERSION:3.0\r\nUID:e\r\nFN:Bad\u000BName\u0000\r\nEND:VCARD\r\n',
    );

    const result = await handler.handle(
      multigetBody([`${bookUrl(contacts)}/evil.vcf`]),
      context(),
    );

    // eslint-disable-next-line no-control-regex -- asserting exactly these characters are gone.
    expect(result.body).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    const [response] = parseMultistatus(result.body);
    const data = response.propstats[0].props.find(
      (p) => p.name === 'address-data',
    );
    expect(data?.value).toContain('FN:BadName');
  });
});
