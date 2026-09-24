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
  AddressObjectIndex,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import type { ReportContext } from '../webdav/report-registry.js';
import {
  AddressbookQueryReportHandler,
  MAX_QUERY_RESULTS,
} from './addressbook-query-report.js';
import { indexVCard } from './index-vcard.js';
import { parseVCard } from './vcard-parser.js';

const PASSWORD = 'correct horse battery staple';
const CARDDAV = 'urn:ietf:params:xml:ns:carddav';

interface ParsedResponse {
  href: string;
  status: string | undefined;
  errors: string[];
  propstats: Array<{
    status: string;
    props: Array<{ name: string; value: string }>;
  }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- test-only DOM walking over xmlbuilder2's untyped node tree. */
function kids(node: any): any[] {
  return Array.from(node.childNodes as ArrayLike<any>).filter(
    (child: any) => child.nodeType === 1,
  );
}

/** Parses a multistatus body with a real XML parser. */
function parseMultistatus(xml: string): ParsedResponse[] {
  const root: any = create(xml).root().node;
  expect(root.localName).toBe('multistatus');
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
                name: property.localName,
                value: property.textContent,
              })),
            };
          }),
      };
    });
}
/** The root and condition elements (namespace + local name) of a `<D:error>` body. */
function errorNames(body: string): { root: string; conditions: string[] } {
  const root: any = create(body).root().node;
  return {
    root: `${root.namespaceURI}${root.localName}`,
    conditions: kids(root).map((c: any) => `${c.namespaceURI}${c.localName}`),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The contact names (last href segment) of the 200 responses, in response order. */
function names(xml: string): string[] {
  return parseMultistatus(xml)
    .filter((response) => response.propstats.length > 0)
    .map((response) =>
      decodeURIComponent(response.href.split('/').pop() ?? ''),
    );
}

function card(fields: {
  uid: string;
  fn: string;
  emails?: string[];
  nickname?: string;
  tel?: string;
  org?: string;
}): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${fields.uid}`,
    `FN:${fields.fn}`,
    ...(fields.emails ?? []).map((email) => `EMAIL:${email}`),
    ...(fields.nickname ? [`NICKNAME:${fields.nickname}`] : []),
    ...(fields.tel ? [`TEL:${fields.tel}`] : []),
    ...(fields.org ? [`ORG:${fields.org}`] : []),
    'END:VCARD',
    '',
  ].join('\r\n');
}

function queryBody(
  filter: string,
  options: { limit?: number; prop?: string } = {},
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<C:addressbook-query xmlns:D="DAV:" xmlns:C="${CARDDAV}">
  <D:prop>${options.prop ?? '<D:getetag/>'}</D:prop>
  ${filter}
  ${options.limit === undefined ? '' : `<C:limit><C:nresults>${options.limit}</C:nresults></C:limit>`}
</C:addressbook-query>`;
}

/** A `<C:filter>` with one prop-filter holding one text-match. */
function textFilter(
  property: string,
  text: string,
  attributes = '',
  filterAttributes = '',
): string {
  return `<C:filter${filterAttributes}><C:prop-filter name="${property}"><C:text-match ${attributes}>${text}</C:text-match></C:prop-filter></C:filter>`;
}

describe('AddressbookQueryReportHandler', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let bob: Principal;
  let carol: Principal;
  let contacts: AddressbookCollection;
  let other: AddressbookCollection;
  let handler: AddressbookQueryReportHandler;

  function context(overrides: Partial<ReportContext> = {}): ReportContext {
    return {
      tenant,
      principal: alice,
      manager: dataSource.manager,
      segments: ['addressbooks', alice.id, 'Contacts'],
      depth: '1',
      ...overrides,
    };
  }

  async function query(
    body: string,
    overrides: Partial<ReportContext> = {},
    useHandler: AddressbookQueryReportHandler = handler,
  ) {
    return useHandler.handle(body, context(overrides));
  }

  async function addBook(name: string): Promise<AddressbookCollection> {
    const book = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.id,
        displayName: name,
      }),
    );
    await dataSource.getRepository(AddressbookAce).save(
      dataSource.getRepository(AddressbookAce).create({
        addressbookId: book.id,
        principalId: alice.id,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    );
    return book;
  }

  /** Stores a contact exactly as PUT does: content blob plus index rows. */
  async function addContact(
    name: string,
    text: string,
    book: AddressbookCollection = contacts,
  ): Promise<AddressObject> {
    const parsed = parseVCard(text);
    return dataSource.transaction(async (manager) => {
      const contact = await manager.getRepository(AddressObject).save(
        manager.getRepository(AddressObject).create({
          tenantId: tenant.id,
          addressbookId: book.id,
          name,
          uid: parsed.uid,
          etag: `"etag-${name}"`,
          ownerPrincipalId: alice.id,
        }),
      );
      await manager.getRepository(AddressObjectContent).save(
        manager.getRepository(AddressObjectContent).create({
          addressObjectId: contact.id,
          vcardData: text,
        }),
      );
      await indexVCard(manager, contact.id, parsed);
      return contact;
    });
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
    const createUser = async (username: string): Promise<Principal> => {
      const user = await userService.createUser({
        tenantId: tenant.id,
        username,
        email: `${username}@example.com`,
        password: PASSWORD,
      });
      return dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: user.principalId });
    };
    alice = await createUser('alice');
    bob = await createUser('bob');
    carol = await createUser('carol');

    contacts = await addBook('Contacts');
    other = await addBook('Other');
    handler = new AddressbookQueryReportHandler();

    await addContact(
      'a-alice.vcf',
      card({
        uid: 'u-alice',
        fn: 'Alice Anderson',
        emails: ['alice@Example.COM', 'a.anderson@work.org'],
        nickname: 'Ally',
      }),
    );
    await addContact(
      'b-bob.vcf',
      card({
        uid: 'u-bob',
        fn: 'Bob Brown',
        emails: ['bob@example.com'],
        tel: '+1 555 0100',
      }),
    );
    await addContact(
      'c-carol.vcf',
      card({
        uid: 'u-carol',
        fn: 'Carol Clark',
        emails: ['carol@other.net'],
        nickname: 'CC',
        org: 'Acme',
      }),
    );
    await addContact(
      'd-dave.vcf',
      card({
        uid: 'u-dave',
        fn: 'Dave 100% _Real_ \\ Back!',
        emails: ['dave@example.com'],
      }),
    );
    await addContact('e-erin.vcf', card({ uid: 'u-erin', fn: 'Erin Abc Def' }));
    await addContact(
      'f-jose.vcf',
      card({ uid: 'u-jose', fn: 'José García', emails: ['jose@example.com'] }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  describe('filtering', () => {
    it('contains on EMAIL finds a substring regardless of letter case — in the value and in the query', async () => {
      const upper = await query(queryBody(textFilter('EMAIL', 'EXAMPLE.com')));
      const lower = await query(queryBody(textFilter('EMAIL', 'example.COM')));

      const expected = ['a-alice.vcf', 'b-bob.vcf', 'd-dave.vcf', 'f-jose.vcf'];
      expect(upper.status).toBe(207);
      expect(names(upper.body)).toEqual(expected);
      expect(names(lower.body)).toEqual(expected);
    });

    it('matches on any of a contact’s several values for the property', async () => {
      const result = await query(queryBody(textFilter('EMAIL', 'work.org')));

      expect(names(result.body)).toEqual(['a-alice.vcf']);
    });

    it('treats match-type as equals / starts-with / ends-with, and contains by default', async () => {
      const run = async (matchType: string, text: string) =>
        names(
          (
            await query(
              queryBody(textFilter('EMAIL', text, `match-type="${matchType}"`)),
            )
          ).body,
        );

      expect(await run('equals', 'BOB@example.com')).toEqual(['b-bob.vcf']);
      expect(await run('equals', 'bob@example')).toEqual([]);
      expect(await run('starts-with', 'carol@')).toEqual(['c-carol.vcf']);
      expect(await run('starts-with', 'other.net')).toEqual([]);
      expect(await run('ends-with', '.org')).toEqual(['a-alice.vcf']);
      expect(await run('ends-with', 'work')).toEqual([]);
      expect(await run('contains', 'rol@oth')).toEqual(['c-carol.vcf']);
    });

    it('allof returns only contacts meeting both conditions; anyof (and the default) the union', async () => {
      const conditions = `
        <C:prop-filter name="FN"><C:text-match>alice</C:text-match></C:prop-filter>
        <C:prop-filter name="EMAIL"><C:text-match>other.net</C:text-match></C:prop-filter>`;
      const both = `
        <C:prop-filter name="FN"><C:text-match>alice</C:text-match></C:prop-filter>
        <C:prop-filter name="EMAIL"><C:text-match>example.com</C:text-match></C:prop-filter>`;
      const filter = (test: string, inner: string) =>
        `<C:filter${test}>${inner}</C:filter>`;

      const allOfDisjoint = await query(
        queryBody(filter(' test="allof"', conditions)),
      );
      const allOfBoth = await query(queryBody(filter(' test="allof"', both)));
      const anyOf = await query(queryBody(filter(' test="anyof"', conditions)));
      const defaultTest = await query(queryBody(filter('', conditions)));

      expect(names(allOfDisjoint.body)).toEqual([]);
      expect(names(allOfBoth.body)).toEqual(['a-alice.vcf']);
      expect(names(anyOf.body)).toEqual(['a-alice.vcf', 'c-carol.vcf']);
      expect(names(defaultTest.body)).toEqual(['a-alice.vcf', 'c-carol.vcf']);
    });

    it('combines several text-matches of one prop-filter by the prop-filter test (default anyof), each judged over all values', async () => {
      const filter = (test: string) =>
        `<C:filter><C:prop-filter name="EMAIL"${test}>
           <C:text-match>alice@</C:text-match>
           <C:text-match>work.org</C:text-match>
           <C:text-match>carol@</C:text-match>
         </C:prop-filter></C:filter>`;

      const anyOf = await query(queryBody(filter('')));
      const allOf = await query(queryBody(filter(' test="allof"')));

      expect(names(anyOf.body)).toEqual(['a-alice.vcf', 'c-carol.vcf']);
      // alice's two emails together satisfy "alice@" and "work.org", but nobody has "carol@" too.
      expect(names(allOf.body)).toEqual([]);
    });

    it('is-not-defined finds contacts without the property', async () => {
      const result = await query(
        queryBody(
          '<C:filter><C:prop-filter name="NICKNAME"><C:is-not-defined/></C:prop-filter></C:filter>',
        ),
      );

      expect(names(result.body)).toEqual([
        'b-bob.vcf',
        'd-dave.vcf',
        'e-erin.vcf',
        'f-jose.vcf',
      ]);
    });

    it('an empty prop-filter finds contacts that have the property at all', async () => {
      const result = await query(
        queryBody('<C:filter><C:prop-filter name="TEL"/></C:filter>'),
      );

      expect(names(result.body)).toEqual(['b-bob.vcf']);
    });

    it('is-not-defined combines with other conditions under allof', async () => {
      const result = await query(
        queryBody(`<C:filter test="allof">
          <C:prop-filter name="NICKNAME"><C:is-not-defined/></C:prop-filter>
          <C:prop-filter name="EMAIL"><C:text-match>example.com</C:text-match></C:prop-filter>
        </C:filter>`),
      );

      expect(names(result.body)).toEqual([
        'b-bob.vcf',
        'd-dave.vcf',
        'f-jose.vcf',
      ]);
    });

    it('negate-condition matches contacts that have the property but no value matching — never contacts lacking it', async () => {
      const result = await query(
        queryBody(textFilter('EMAIL', 'example.com', 'negate-condition="yes"')),
      );

      // alice has one matching email, so she's out even though her other one doesn't match;
      // erin has no EMAIL at all, so there's nothing to "not match".
      expect(names(result.body)).toEqual(['c-carol.vcf']);
    });

    it('treats an empty or absent filter as matching every contact', async () => {
      const empty = await query(queryBody('<C:filter/>'));

      expect(names(empty.body)).toHaveLength(6);
    });

    it('matches property names case-insensitively', async () => {
      const result = await query(queryBody(textFilter('nickname', 'ally')));

      expect(names(result.body)).toEqual(['a-alice.vcf']);
    });

    it('only searches the requested addressbook', async () => {
      await addContact(
        'x-other.vcf',
        card({ uid: 'u-x', fn: 'Xavier', emails: ['x@example.com'] }),
        other,
      );

      const result = await query(queryBody(textFilter('FN', 'xavier')));

      expect(names(result.body)).toEqual([]);
    });

    it('takes % _ ! and \\ in the search text literally, never as wildcards', async () => {
      const run = async (text: string, matchType = 'contains') =>
        names(
          (
            await query(
              queryBody(textFilter('FN', text, `match-type="${matchType}"`)),
            )
          ).body,
        );

      // Each of these matches only dave's literal "Dave 100% _Real_ \ Back!".
      expect(await run('100%')).toEqual(['d-dave.vcf']);
      expect(await run('_real_')).toEqual(['d-dave.vcf']);
      expect(await run('\\ back')).toEqual(['d-dave.vcf']);
      expect(await run('back!')).toEqual(['d-dave.vcf']);
      expect(await run('%')).toEqual(['d-dave.vcf']);
      expect(await run('_')).toEqual(['d-dave.vcf']);
      expect(await run('!')).toEqual(['d-dave.vcf']);
      expect(await run('dave 100% _real_ \\ back!', 'equals')).toEqual([
        'd-dave.vcf',
      ]);
      // As wildcards these would match erin's "Erin Abc Def" (or everybody).
      expect(await run('erin a_c', 'starts-with')).toEqual([]);
      expect(await run('erin%def', 'contains')).toEqual([]);
      expect(await run('!%', 'contains')).toEqual([]);
    });

    it('keeps accents significant while ignoring case', async () => {
      const run = async (text: string) =>
        names((await query(queryBody(textFilter('FN', text)))).body);

      expect(await run('JOSÉ')).toEqual(['f-jose.vcf']);
      expect(await run('jose')).toEqual([]);
    });

    it('accepts the i;ascii-casemap, i;unicode-casemap and default collations', async () => {
      for (const collation of [
        'i;ascii-casemap',
        'i;unicode-casemap',
        'default',
      ]) {
        const result = await query(
          queryBody(textFilter('FN', 'BOB', `collation="${collation}"`)),
        );
        expect(names(result.body), collation).toEqual(['b-bob.vcf']);
      }
    });

    it('binds search text as a parameter: SQL metacharacters in it change nothing', async () => {
      const result = await query(
        queryBody(textFilter('FN', "x') OR ('1'='1", 'match-type="equals"')),
      );

      expect(result.status).toBe(207);
      expect(names(result.body)).toEqual([]);
    });
  });

  describe('the index, not the vCard blob, decides', () => {
    it('matches on the indexed values even when the stored vCard text says something else', async () => {
      const contact = await dataSource
        .getRepository(AddressObject)
        .findOneByOrFail({ name: 'c-carol.vcf' });
      await dataSource
        .getRepository(AddressObjectContent)
        .update(
          { addressObjectId: contact.id },
          { vcardData: 'this is not even a vCard' },
        );

      const result = await query(queryBody(textFilter('EMAIL', 'carol@other')));

      expect(names(result.body)).toEqual(['c-carol.vcf']);
    });

    it('does not match on text that only the stored vCard has: the blob is never read for the decision', async () => {
      const contact = await dataSource
        .getRepository(AddressObject)
        .findOneByOrFail({ name: 'b-bob.vcf' });
      await dataSource.getRepository(AddressObjectContent).update(
        { addressObjectId: contact.id },
        {
          vcardData: card({
            uid: 'u-bob',
            fn: 'Bob',
            emails: ['ghost@blob-only.example'],
          }),
        },
      );

      const result = await query(queryBody(textFilter('EMAIL', 'blob-only')));

      expect(names(result.body)).toEqual([]);
    });

    it('is-not-defined follows the index too: a contact whose index rows are gone counts as lacking the property', async () => {
      const contact = await dataSource
        .getRepository(AddressObject)
        .findOneByOrFail({ name: 'a-alice.vcf' });
      await dataSource
        .getRepository(AddressObjectIndex)
        .delete({ addressObjectId: contact.id, propertyName: 'NICKNAME' });

      const result = await query(
        queryBody(
          '<C:filter><C:prop-filter name="NICKNAME"><C:is-not-defined/></C:prop-filter></C:filter>',
        ),
      );

      expect(names(result.body)).toContain('a-alice.vcf');
    });

    it('loads the vCard text only for the returned matches, and only when address-data is requested', async () => {
      const queries: string[] = [];
      const logging = dataSource.logger;
      dataSource.logger = {
        ...logging,
        logQuery: (sql: string) => queries.push(sql),
      } as typeof dataSource.logger;
      dataSource.options = {
        ...dataSource.options,
        logging: ['query'],
      } as typeof dataSource.options;

      await query(queryBody(textFilter('EMAIL', 'example.com')));
      const withoutData = queries.filter((sql) =>
        /address_object_contents/.test(sql),
      );
      queries.length = 0;
      await query(
        queryBody(textFilter('EMAIL', 'example.com'), {
          prop: '<D:getetag/><C:address-data/>',
        }),
      );
      const withData = queries.filter((sql) =>
        /address_object_contents/.test(sql),
      );

      expect(withoutData).toEqual([]);
      expect(withData).toHaveLength(1);
    });
  });

  describe('unsupported filters', () => {
    it('refuses a prop-filter on a property that is not indexed with 403 and CARDDAV:supported-filter naming it', async () => {
      const result = await query(queryBody(textFilter('BDAY', '1980')));

      expect(result.status).toBe(403);
      expect(errorNames(result.body)).toEqual({
        root: 'DAV:error',
        conditions: [`${CARDDAV}supported-filter`],
      });
      expect(result.body).toContain('name="BDAY"');
    });

    it('refuses is-not-defined on a non-indexed property instead of matching every contact', async () => {
      const result = await query(
        queryBody(
          '<C:filter><C:prop-filter name="BDAY"><C:is-not-defined/></C:prop-filter></C:filter>',
        ),
      );

      expect(result.status).toBe(403);
      expect(result.body).toContain('supported-filter');
    });

    it('refuses every param-filter, even one nested in a supported prop-filter', async () => {
      const result = await query(
        queryBody(
          '<C:filter><C:prop-filter name="TEL"><C:param-filter name="TYPE"><C:text-match>work</C:text-match></C:param-filter></C:prop-filter></C:filter>',
        ),
      );

      expect(result.status).toBe(403);
      expect(result.body).toContain('<param-filter name="TYPE"');
    });

    it('refuses a group-prefixed name, which the index cannot tell apart', async () => {
      const result = await query(queryBody(textFilter('item1.EMAIL', 'x')));

      expect(result.status).toBe(403);
    });

    it('refuses an unsupported collation with CARDDAV:supported-collation', async () => {
      const result = await query(
        queryBody(textFilter('FN', 'bob', 'collation="i;octet"')),
      );

      expect(result.status).toBe(403);
      expect(errorNames(result.body).conditions).toEqual([
        `${CARDDAV}supported-collation`,
      ]);
    });

    it('is 403 supported-address-data for an unsupported address-data media type', async () => {
      const result = await query(
        queryBody(textFilter('FN', 'bob'), {
          prop: '<C:address-data content-type="text/x-other"/>',
        }),
      );

      expect(result.status).toBe(403);
      expect(result.body).toContain('supported-address-data');
    });
  });

  describe('scope', () => {
    it('Depth 0 is the addressbook alone, which holds no address object: an empty multistatus', async () => {
      const result = await query(queryBody('<C:filter/>'), { depth: '0' });

      expect(result.status).toBe(207);
      expect(parseMultistatus(result.body)).toEqual([]);
    });

    it('a missing Depth header defaults to 0 (RFC 3253 §3.6)', async () => {
      const result = await query(queryBody('<C:filter/>'), {
        depth: undefined,
      });

      expect(result.status).toBe(207);
      expect(parseMultistatus(result.body)).toEqual([]);
    });

    it('Depth 1 and infinity search the contacts; any other value is 400', async () => {
      for (const depth of ['1', 'infinity', ' Infinity ']) {
        const result = await query(queryBody('<C:filter/>'), { depth });
        expect(names(result.body), depth).toHaveLength(6);
      }
      for (const depth of ['2', 'all', '']) {
        expect(
          (await query(queryBody('<C:filter/>'), { depth })).status,
          depth,
        ).toBe(400);
      }
    });
  });

  describe('limits', () => {
    const filterAll = '<C:filter/>';

    it('nresults caps the results and adds a 507 for the Request-URI — first, and outside the count', async () => {
      const result = await query(queryBody(filterAll, { limit: 2 }));

      const responses = parseMultistatus(result.body);
      expect(result.status).toBe(207);
      expect(responses).toHaveLength(3);
      expect(responses[0]).toMatchObject({
        href: `/dav/acme/addressbooks/${alice.id}/Contacts`,
        status: 'HTTP/1.1 507 Insufficient Storage',
        errors: ['DAV:number-of-matches-within-limits'],
        propstats: [],
      });
      expect(names(result.body)).toEqual(['a-alice.vcf', 'b-bob.vcf']);
    });

    it('no 507 when the matches fit the limit exactly or under it', async () => {
      for (const limit of [6, 100]) {
        const result = await query(queryBody(filterAll, { limit }));
        const responses = parseMultistatus(result.body);
        expect(responses, `limit ${limit}`).toHaveLength(6);
        expect(responses.some((r) => r.status !== undefined)).toBe(false);
      }
    });

    it('nresults 0 returns no contacts but still reports the truncation when something matched', async () => {
      const result = await query(queryBody(filterAll, { limit: 0 }));

      const responses = parseMultistatus(result.body);
      expect(responses).toHaveLength(1);
      expect(responses[0]?.status).toBe('HTTP/1.1 507 Insufficient Storage');
    });

    it('the server-side cap applies with no client limit at all', async () => {
      const capped = new AddressbookQueryReportHandler(4);

      const result = await query(queryBody(filterAll), {}, capped);

      expect(names(result.body)).toEqual([
        'a-alice.vcf',
        'b-bob.vcf',
        'c-carol.vcf',
        'd-dave.vcf',
      ]);
      expect(parseMultistatus(result.body)[0]?.status).toBe(
        'HTTP/1.1 507 Insufficient Storage',
      );
    });

    it('the server-side cap also wins over a larger client limit', async () => {
      const capped = new AddressbookQueryReportHandler(3);

      const result = await query(
        queryBody(filterAll, { limit: 5000 }),
        {},
        capped,
      );

      expect(names(result.body)).toHaveLength(3);
      expect(parseMultistatus(result.body)[0]?.status).toBe(
        'HTTP/1.1 507 Insufficient Storage',
      );
    });

    it('the default server-side cap is 5000', () => {
      expect(MAX_QUERY_RESULTS).toBe(5000);
    });

    it('a contact hidden by its own ACE neither appears nor uses up a result slot', async () => {
      await dataSource.getRepository(AddressbookAce).save(
        dataSource.getRepository(AddressbookAce).create({
          addressbookId: contacts.id,
          principalId: bob.id,
          privilege: 'read',
          grantDeny: 'grant',
          position: 1,
        }),
      );
      const first = await dataSource
        .getRepository(AddressObject)
        .findOneByOrFail({ name: 'a-alice.vcf' });
      await dataSource.getRepository(AddressObjectAce).save(
        dataSource.getRepository(AddressObjectAce).create({
          addressObjectId: first.id,
          principalId: bob.id,
          privilege: 'read',
          grantDeny: 'deny',
          position: 0,
        }),
      );

      const limited = await query(queryBody(filterAll, { limit: 1 }), {
        principal: bob,
      });
      const all = await query(queryBody(filterAll), { principal: bob });

      // The hidden contact sorts first; with limit 1 bob still gets a visible one.
      expect(names(limited.body)).toEqual(['b-bob.vcf']);
      expect(names(all.body)).toEqual([
        'b-bob.vcf',
        'c-carol.vcf',
        'd-dave.vcf',
        'e-erin.vcf',
        'f-jose.vcf',
      ]);
    });
  });

  describe('response content', () => {
    it('returns the requested properties, including address-data as raw vCard text, in the CardDAV namespace', async () => {
      const result = await query(
        queryBody(textFilter('FN', 'bob'), {
          prop: '<D:getetag/><C:address-data/>',
        }),
      );

      const [response] = parseMultistatus(result.body);
      expect(response?.href).toBe(
        `/dav/acme/addressbooks/${alice.id}/Contacts/b-bob.vcf`,
      );
      const props = response?.propstats[0]?.props ?? [];
      expect(props.find((p) => p.name === 'getetag')?.value).toBe(
        '"etag-b-bob.vcf"',
      );
      expect(
        props
          .find((p) => p.name === 'address-data')
          ?.value.replace(/\r\n/g, '\n'),
      ).toContain('FN:Bob Brown');
      expect(result.body).toContain(`<address-data xmlns="${CARDDAV}">`);
    });

    it('honours partial retrieval of vCard properties', async () => {
      const result = await query(
        queryBody(textFilter('FN', 'bob'), {
          prop: '<C:address-data><C:prop name="EMAIL"/></C:address-data>',
        }),
      );

      const [response] = parseMultistatus(result.body);
      expect(
        response?.propstats[0]?.props[0]?.value.replace(/\r\n/g, '\n'),
      ).toBe('BEGIN:VCARD\nVERSION:3.0\nEMAIL:bob@example.com\nEND:VCARD\n');
    });

    it('answers a query without matches with an empty multistatus', async () => {
      const result = await query(queryBody(textFilter('FN', 'nobody-here')));

      expect(result.status).toBe(207);
      expect(parseMultistatus(result.body)).toEqual([]);
    });
  });

  describe('request handling', () => {
    it('is 403 with an empty body without read on the addressbook, 404 for an unknown or non-addressbook target', async () => {
      const denied = await query(queryBody('<C:filter/>'), {
        principal: carol,
      });
      expect(denied).toEqual({ status: 403, body: '' });

      for (const segments of [
        ['addressbooks', alice.id, 'NoSuchBook'],
        ['addressbooks', alice.id],
        ['addressbooks', 'not-a-uuid', 'Contacts'],
      ]) {
        expect(
          (await query(queryBody('<C:filter/>'), { segments })).status,
        ).toBe(404);
      }
    });

    it('accepts a trailing slash on the Request-URI', async () => {
      const result = await query(queryBody('<C:filter/>'), {
        segments: ['addressbooks', alice.id, 'Contacts', ''],
      });

      expect(names(result.body)).toHaveLength(6);
    });

    it('is 400 for a malformed body, another report’s root element, or a missing filter', async () => {
      for (const body of [
        '<not-xml',
        '<D:sync-collection xmlns:D="DAV:"/>',
        `<C:addressbook-query xmlns:C="${CARDDAV}"/>`,
      ]) {
        expect((await query(body)).status, body).toBe(400);
      }
    });
  });
});
