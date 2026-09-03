import { describe, expect, it } from 'vitest';
import { create } from 'xmlbuilder2';
import { buildMkcolResponse } from './mkcol-response-builder.js';

describe('buildMkcolResponse', () => {
  it('groups same-status properties into one propstat, per RFC 5689 §4.1.1', () => {
    const xml = buildMkcolResponse([
      { namespace: 'DAV:', name: 'resourcetype', status: 200 },
      { namespace: 'DAV:', name: 'displayname', status: 200 },
    ]);

    const root = create(xml).root();
    expect(root.node.localName).toBe('mkcol-response');
    expect(root.node.namespaceURI).toBe('DAV:');

    let propstatCount = 0;
    let statusText = '';
    const propertyNames: string[] = [];
    root.each((propstat) => {
      propstatCount += 1;
      propstat.each((child) => {
        if (child.node.localName === 'prop') {
          child.each((prop) => propertyNames.push(prop.node.localName));
        }
        if (child.node.localName === 'status') {
          statusText = child.node.textContent ?? '';
        }
      });
    });

    expect(propstatCount).toBe(1);
    expect(propertyNames).toEqual(['resourcetype', 'displayname']);
    expect(statusText).toBe('HTTP/1.1 200 OK');
  });

  it('separates properties with different statuses into separate propstat blocks, per RFC 5689 §3.5', () => {
    const xml = buildMkcolResponse([
      { namespace: 'DAV:', name: 'resourcetype', status: 403 },
      { namespace: 'DAV:', name: 'displayname', status: 424 },
    ]);

    const root = create(xml).root();
    const statuses: string[] = [];
    root.each((propstat) => {
      propstat.each((child) => {
        if (child.node.localName === 'status') {
          statuses.push(child.node.textContent ?? '');
        }
      });
    });

    expect(statuses).toEqual([
      'HTTP/1.1 403 Forbidden',
      'HTTP/1.1 424 Failed Dependency',
    ]);
  });
});
