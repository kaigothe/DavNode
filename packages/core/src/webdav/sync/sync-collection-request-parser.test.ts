import { describe, expect, it } from 'vitest';
import { parseSyncCollectionRequestBody } from './sync-collection-request-parser.js';

describe('parseSyncCollectionRequestBody', () => {
  it('parses an initial-sync body (empty sync-token)', () => {
    const result = parseSyncCollectionRequestBody(`<?xml version="1.0" encoding="utf-8" ?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token/>
  <D:sync-level>1</D:sync-level>
  <D:prop><D:getetag/></D:prop>
</D:sync-collection>`);

    expect(result.syncToken).toBe('');
    expect(result.syncLevel).toBe('1');
    expect(result.properties).toEqual([{ namespace: 'DAV:', name: 'getetag' }]);
  });

  it('parses a body with a non-empty sync-token', () => {
    const result = parseSyncCollectionRequestBody(
      '<D:sync-collection xmlns:D="DAV:"><D:sync-token>davnode-sync:abc:5</D:sync-token><D:sync-level>1</D:sync-level><D:prop><D:getetag/></D:prop></D:sync-collection>',
    );

    expect(result.syncToken).toBe('davnode-sync:abc:5');
  });

  it('reports the raw sync-level value even when unsupported, for the caller to reject', () => {
    const result = parseSyncCollectionRequestBody(
      '<D:sync-collection xmlns:D="DAV:"><D:sync-token/><D:sync-level>infinite</D:sync-level><D:prop><D:getetag/></D:prop></D:sync-collection>',
    );

    expect(result.syncLevel).toBe('infinite');
  });

  it('parses multiple requested properties, including a custom namespace', () => {
    const result = parseSyncCollectionRequestBody(
      '<D:sync-collection xmlns:D="DAV:" xmlns:R="urn:example:ns"><D:sync-token/><D:sync-level>1</D:sync-level><D:prop><D:getetag/><R:bigbox/></D:prop></D:sync-collection>',
    );

    expect(result.properties).toEqual([
      { namespace: 'DAV:', name: 'getetag' },
      { namespace: 'urn:example:ns', name: 'bigbox' },
    ]);
  });

  it('throws for a root element that is not DAV:sync-collection', () => {
    expect(() =>
      parseSyncCollectionRequestBody('<D:propfind xmlns:D="DAV:"/>'),
    ).toThrow();
  });

  it('throws for an empty body', () => {
    expect(() => parseSyncCollectionRequestBody('')).toThrow();
  });

  it('throws when DAV:sync-level is missing', () => {
    expect(() =>
      parseSyncCollectionRequestBody(
        '<D:sync-collection xmlns:D="DAV:"><D:sync-token/><D:prop><D:getetag/></D:prop></D:sync-collection>',
      ),
    ).toThrow();
  });
});
