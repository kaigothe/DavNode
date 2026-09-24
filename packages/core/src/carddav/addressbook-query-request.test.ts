import { describe, expect, it } from 'vitest';
import {
  MAX_FILTER_CONDITIONS,
  parseAddressbookQueryRequestBody,
} from './addressbook-query-request.js';

function body(inner: string, attributes = ''): string {
  return `<C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"${attributes}><D:prop><D:getetag/></D:prop>${inner}</C:addressbook-query>`;
}

describe('parseAddressbookQueryRequestBody', () => {
  it('applies the RFC defaults: filter test anyof, prop-filter test anyof, match-type contains, unicode-casemap, no negation', () => {
    const parsed = parseAddressbookQueryRequestBody(
      body(
        '<C:filter><C:prop-filter name="email"><C:text-match>Foo</C:text-match></C:prop-filter></C:filter>',
      ),
    );

    expect(parsed.filter).toEqual({
      test: 'anyof',
      propFilters: [
        {
          name: 'EMAIL',
          requestedName: 'email',
          test: 'anyof',
          isNotDefined: false,
          textMatches: [
            {
              value: 'Foo',
              matchType: 'contains',
              negate: false,
              collation: 'i;unicode-casemap',
            },
          ],
          paramFilters: [],
        },
      ],
    });
    expect(parsed.limit).toBeUndefined();
    expect(parsed.selection.kind).toBe('prop');
  });

  it('reads every attribute: tests, match-type, negate-condition, collation', () => {
    const parsed = parseAddressbookQueryRequestBody(
      body(
        `<C:filter test="allof">
           <C:prop-filter name="FN" test="allof">
             <C:text-match match-type="starts-with" negate-condition="yes" collation="I;ASCII-CASEMAP">a</C:text-match>
             <C:text-match match-type="ends-with">b</C:text-match>
             <C:text-match match-type="equals">c</C:text-match>
           </C:prop-filter>
           <C:prop-filter name="NICKNAME"><C:is-not-defined/></C:prop-filter>
         </C:filter>`,
      ),
    );

    expect(parsed.filter.test).toBe('allof');
    const [fn, nickname] = parsed.filter.propFilters;
    expect(fn?.test).toBe('allof');
    expect(fn?.textMatches).toMatchObject([
      { matchType: 'starts-with', negate: true, collation: 'i;ascii-casemap' },
      { matchType: 'ends-with', negate: false },
      { matchType: 'equals', negate: false },
    ]);
    expect(nickname).toMatchObject({ name: 'NICKNAME', isNotDefined: true });
  });

  it('collects param-filters (only so they can be reported) and an empty prop-filter', () => {
    const parsed = parseAddressbookQueryRequestBody(
      body(
        '<C:filter><C:prop-filter name="TEL"><C:param-filter name="type"><C:text-match>work</C:text-match></C:param-filter></C:prop-filter><C:prop-filter name="FN"/></C:filter>',
      ),
    );

    expect(parsed.filter.propFilters[0]?.paramFilters).toEqual([
      { name: 'type' },
    ]);
    expect(parsed.filter.propFilters[1]).toMatchObject({
      textMatches: [],
      isNotDefined: false,
    });
  });

  it('accepts an empty filter (matches everything) and a limit', () => {
    const parsed = parseAddressbookQueryRequestBody(
      body('<C:filter/><C:limit><C:nresults> 25 </C:nresults></C:limit>'),
    );

    expect(parsed.filter.propFilters).toEqual([]);
    expect(parsed.limit).toBe(25);
  });

  it.each([
    ['no filter', body('')],
    ['an invalid filter test', body('<C:filter test="some"/>')],
    [
      'a prop-filter without a name',
      body('<C:filter><C:prop-filter/></C:filter>'),
    ],
    [
      'an invalid match-type',
      body(
        '<C:filter><C:prop-filter name="FN"><C:text-match match-type="regex">x</C:text-match></C:prop-filter></C:filter>',
      ),
    ],
    [
      'an invalid negate-condition',
      body(
        '<C:filter><C:prop-filter name="FN"><C:text-match negate-condition="maybe">x</C:text-match></C:prop-filter></C:filter>',
      ),
    ],
    [
      'is-not-defined together with a text-match',
      body(
        '<C:filter><C:prop-filter name="FN"><C:is-not-defined/><C:text-match>x</C:text-match></C:prop-filter></C:filter>',
      ),
    ],
    [
      'a param-filter without a name',
      body(
        '<C:filter><C:prop-filter name="TEL"><C:param-filter/></C:prop-filter></C:filter>',
      ),
    ],
    ['a limit without nresults', body('<C:filter/><C:limit/>')],
    [
      'a non-numeric nresults',
      body('<C:filter/><C:limit><C:nresults>ten</C:nresults></C:limit>'),
    ],
    [
      'a negative nresults',
      body('<C:filter/><C:limit><C:nresults>-1</C:nresults></C:limit>'),
    ],
    ['another root element', '<D:sync-collection xmlns:D="DAV:"/>'],
    ['malformed XML', '<not-xml'],
  ])('rejects %s', (_name, xml) => {
    expect(() => parseAddressbookQueryRequestBody(xml)).toThrow();
  });

  it('rejects a filter with more conditions than MAX_FILTER_CONDITIONS', () => {
    const many = (count: number) =>
      body(
        `<C:filter>${'<C:prop-filter name="FN"/>'.repeat(count)}</C:filter>`,
      );

    expect(() =>
      parseAddressbookQueryRequestBody(many(MAX_FILTER_CONDITIONS)),
    ).not.toThrow();
    expect(() =>
      parseAddressbookQueryRequestBody(many(MAX_FILTER_CONDITIONS + 1)),
    ).toThrow(/conditions/);
  });
});
