import { create } from 'xmlbuilder2';
import { describe, expect, it } from 'vitest';
import { buildErrorResponse } from './error-response-builder.js';

const CARDDAV = 'urn:ietf:params:xml:ns:carddav';

describe('buildErrorResponse', () => {
  it('lists bare string conditions as DAV: elements', () => {
    const root = create(buildErrorResponse(['valid-sync-token'])).root();

    expect(root.node.namespaceURI).toBe('DAV:');
    expect(root.node.localName).toBe('error');
    const conditions = root.filter(() => true, false, true);
    expect(
      conditions.map((c) => `${c.node.namespaceURI}${c.node.localName}`),
    ).toEqual(['DAV:valid-sync-token']);
  });

  it('emits a condition in another namespace with attributes and nested conditions', () => {
    const xml = buildErrorResponse([
      {
        namespace: CARDDAV,
        name: 'supported-filter',
        children: [
          {
            namespace: CARDDAV,
            name: 'prop-filter',
            attributes: { name: 'X-FOO' },
          },
        ],
      },
    ]);

    const root = create(xml).root();
    const [filter] = root.filter(
      (n) => n.node.localName === 'supported-filter',
      false,
      true,
    );
    expect(filter?.node.namespaceURI).toBe(CARDDAV);
    const [propFilter] = root.filter(
      (n) => n.node.localName === 'prop-filter',
      false,
      true,
    );
    expect(propFilter?.node.namespaceURI).toBe(CARDDAV);
    expect(
      (
        propFilter?.node as unknown as { getAttribute(n: string): string }
      ).getAttribute('name'),
    ).toBe('X-FOO');
  });

  it('emits the text of a condition, e.g. the href inside no-uid-conflict', () => {
    const xml = buildErrorResponse([
      {
        namespace: 'urn:ietf:params:xml:ns:caldav',
        name: 'no-uid-conflict',
        children: [
          { namespace: 'DAV:', name: 'D:href', text: '/dav/a b/x&y.ics' },
        ],
      },
    ]);

    const root = create(xml).root();
    const [href] = root.filter((n) => n.node.localName === 'href', false, true);
    expect(href?.node.namespaceURI).toBe('DAV:');
    expect(href?.node.textContent).toBe('/dav/a b/x&y.ics');
    expect(xml).toContain('x&amp;y.ics');
  });

  it('mixes bare and namespaced conditions in order', () => {
    const xml = buildErrorResponse([
      'number-of-matches-within-limits',
      { namespace: CARDDAV, name: 'supported-collation' },
    ]);

    const names = create(xml)
      .root()
      .filter(() => true, false, true)
      .map((c) => `${c.node.namespaceURI}${c.node.localName}`);
    expect(names).toEqual([
      'DAV:number-of-matches-within-limits',
      `${CARDDAV}supported-collation`,
    ]);
  });
});
