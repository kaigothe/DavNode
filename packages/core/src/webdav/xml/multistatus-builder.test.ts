import { create } from 'xmlbuilder2';
import { describe, expect, it } from 'vitest';
import { buildMultistatusResponse } from './multistatus-builder.js';

/** All descendants of `root` (at any depth) with local name `localName`, in document order. */
function findAll(root: ReturnType<typeof create>, localName: string) {
  return root.filter((node) => node.node.localName === localName, false, true);
}

describe('buildMultistatusResponse', () => {
  it('builds a single 200 propstat for a resource with only successful properties', () => {
    const xml = buildMultistatusResponse([
      {
        href: '/dav/acme/files/report.txt',
        properties: [
          {
            namespace: 'DAV:',
            name: 'displayname',
            value: 'report.txt',
            status: 200,
          },
          {
            namespace: 'DAV:',
            name: 'getcontentlength',
            value: '1024',
            status: 200,
          },
        ],
      },
    ]);

    const root = create(xml).root();
    expect(root.node.localName).toBe('multistatus');
    expect(root.node.namespaceURI).toBe('DAV:');
    expect(findAll(root, 'response')).toHaveLength(1);
    expect(findAll(root, 'propstat')).toHaveLength(1);
  });

  it('splits mixed-success properties into two propstat blocks (200 and 404)', () => {
    const xml = buildMultistatusResponse([
      {
        href: '/dav/acme/files/report.txt',
        properties: [
          {
            namespace: 'DAV:',
            name: 'displayname',
            value: 'report.txt',
            status: 200,
          },
          { namespace: 'urn:example:ns', name: 'does-not-exist', status: 404 },
        ],
      },
    ]);

    const root = create(xml).root();
    const propstats = findAll(root, 'propstat');
    expect(propstats).toHaveLength(2);

    const statuses = findAll(root, 'status').map((s) => s.node.textContent);
    expect(statuses).toEqual(['HTTP/1.1 200 OK', 'HTTP/1.1 404 Not Found']);

    const [foundPropstat, missingPropstat] = propstats;
    expect(findAll(foundPropstat!, 'displayname')).toHaveLength(1);
    expect(findAll(missingPropstat!, 'does-not-exist')).toHaveLength(1);
  });

  it('produces well-formed XML with correct namespace-qualified elements (verified by re-parsing)', () => {
    const xml = buildMultistatusResponse([
      {
        href: '/dav/acme/files/report.txt',
        properties: [
          {
            namespace: 'DAV:',
            name: 'resourcetype',
            value: '<D:collection xmlns:D="DAV:"/>',
            status: 200,
          },
          {
            namespace: 'urn:example:ns',
            name: 'color',
            value: 'blue',
            status: 200,
          },
        ],
      },
    ]);

    const root = create(xml).root();

    const [href] = findAll(root, 'href');
    expect(href?.node.namespaceURI).toBe('DAV:');
    expect(href?.node.textContent).toBe('/dav/acme/files/report.txt');

    const [resourcetype] = findAll(root, 'resourcetype');
    expect(resourcetype?.node.namespaceURI).toBe('DAV:');
    const [collection] = findAll(root, 'collection');
    expect(collection?.node.namespaceURI).toBe('DAV:');

    const [color] = findAll(root, 'color');
    expect(color?.node.namespaceURI).toBe('urn:example:ns');
    expect(color?.node.textContent).toBe('blue');
  });

  it('builds separate <D:response> elements for multiple resources', () => {
    const xml = buildMultistatusResponse([
      {
        href: '/dav/acme/files/a.txt',
        properties: [
          {
            namespace: 'DAV:',
            name: 'displayname',
            value: 'a.txt',
            status: 200,
          },
        ],
      },
      {
        href: '/dav/acme/files/b.txt',
        properties: [
          {
            namespace: 'DAV:',
            name: 'displayname',
            value: 'b.txt',
            status: 200,
          },
        ],
      },
    ]);

    const root = create(xml).root();
    expect(findAll(root, 'response')).toHaveLength(2);
    expect(findAll(root, 'href').map((h) => h.node.textContent)).toEqual([
      '/dav/acme/files/a.txt',
      '/dav/acme/files/b.txt',
    ]);
  });

  it('falls back to a bare status line for a status code with no known reason phrase', () => {
    const xml = buildMultistatusResponse([
      {
        href: '/dav/acme/files/locked.txt',
        properties: [{ namespace: 'DAV:', name: 'lockdiscovery', status: 423 }],
      },
    ]);

    const root = create(xml).root();
    expect(findAll(root, 'status').map((s) => s.node.textContent)).toEqual([
      'HTTP/1.1 423',
    ]);
  });
});
