import { describe, expect, it } from 'vitest';
import { create } from 'xmlbuilder2';
import {
  findUnsupportedFilterParts,
  unsupportedFilterResult,
} from './addressbook-query-filter.js';
import { parseAddressbookQueryRequestBody } from './addressbook-query-request.js';
import { INDEXED_PROPERTY_NAMES } from './index-vcard.js';

function filterOf(inner: string) {
  return parseAddressbookQueryRequestBody(
    `<C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><C:filter>${inner}</C:filter></C:addressbook-query>`,
  ).filter;
}

describe('findUnsupportedFilterParts', () => {
  it('accepts every indexed property, in any case, with supported collations', () => {
    const filter = filterOf(
      INDEXED_PROPERTY_NAMES.map(
        (name) =>
          `<C:prop-filter name="${name.toLowerCase()}"><C:text-match collation="i;ascii-casemap">x</C:text-match><C:text-match collation="default">y</C:text-match></C:prop-filter>`,
      ).join(''),
    );

    expect(findUnsupportedFilterParts(filter)).toEqual({
      propFilters: [],
      paramFilters: [],
      collations: [],
    });
  });

  it('reports non-indexed properties (as sent, once), every param-filter, and unsupported collations', () => {
    const filter = filterOf(
      `<C:prop-filter name="Bday"><C:is-not-defined/></C:prop-filter>
       <C:prop-filter name="Bday"/>
       <C:prop-filter name="item1.EMAIL"/>
       <C:prop-filter name="TEL"><C:param-filter name="type"/><C:param-filter name="type"/></C:prop-filter>
       <C:prop-filter name="FN"><C:text-match collation="i;octet">x</C:text-match></C:prop-filter>`,
    );

    expect(findUnsupportedFilterParts(filter)).toEqual({
      propFilters: ['Bday', 'item1.EMAIL'],
      paramFilters: ['type'],
      collations: ['i;octet'],
    });
  });
});

describe('unsupportedFilterResult', () => {
  it('is null when nothing is unsupported', () => {
    expect(
      unsupportedFilterResult({
        propFilters: [],
        paramFilters: [],
        collations: [],
      }),
    ).toBeNull();
  });

  it('is a 403 whose body names the offending prop-filters and param-filters under CARDDAV:supported-filter', () => {
    const result = unsupportedFilterResult({
      propFilters: ['BDAY'],
      paramFilters: ['TYPE'],
      collations: [],
    });

    expect(result?.status).toBe(403);
    const root = create(result?.body ?? '').root();
    expect(root.node.localName).toBe('error');
    const found = root
      .filter(() => true, false, true)
      .map((n) => {
        const node = n.node as unknown as {
          localName: string;
          namespaceURI: string;
          getAttribute(name: string): string | null;
        };
        return [node.namespaceURI, node.localName, node.getAttribute('name')];
      });
    expect(found).toEqual([
      ['urn:ietf:params:xml:ns:carddav', 'supported-filter', null],
      ['urn:ietf:params:xml:ns:carddav', 'prop-filter', 'BDAY'],
      ['urn:ietf:params:xml:ns:carddav', 'param-filter', 'TYPE'],
    ]);
  });

  it('adds CARDDAV:supported-collation for an unsupported collation, next to supported-filter when both apply', () => {
    const both = unsupportedFilterResult({
      propFilters: ['BDAY'],
      paramFilters: [],
      collations: ['i;octet'],
    });
    const collationOnly = unsupportedFilterResult({
      propFilters: [],
      paramFilters: [],
      collations: ['i;octet'],
    });

    expect(both?.body).toContain('supported-filter');
    expect(both?.body).toContain('supported-collation');
    expect(collationOnly?.body).not.toContain('supported-filter');
    expect(collationOnly?.body).toContain('supported-collation');
  });
});
