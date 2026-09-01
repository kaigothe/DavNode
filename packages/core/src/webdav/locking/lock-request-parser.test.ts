import { describe, expect, it } from 'vitest';
import { parseLockInfoRequestBody } from './lock-request-parser.js';

describe('parseLockInfoRequestBody', () => {
  it('parses an exclusive lockinfo body with an owner', () => {
    const result = parseLockInfoRequestBody(`<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:exclusive/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
  <D:owner><D:href>http://example.org/~ejw/contact.html</D:href></D:owner>
</D:lockinfo>`);

    expect(result.scope).toBe('exclusive');
    expect(result.ownerInfo).toBe(
      '<D:href xmlns:D="DAV:">http://example.org/~ejw/contact.html</D:href>',
    );
  });

  it('parses a shared lockinfo body without an owner', () => {
    const result = parseLockInfoRequestBody(`<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:shared/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
</D:lockinfo>`);

    expect(result.scope).toBe('shared');
    expect(result.ownerInfo).toBeNull();
  });

  it('throws for a root element that is not DAV:lockinfo', () => {
    expect(() =>
      parseLockInfoRequestBody('<D:propfind xmlns:D="DAV:"/>'),
    ).toThrow();
  });

  it('throws for an empty body', () => {
    expect(() => parseLockInfoRequestBody('')).toThrow();
  });

  it('throws when DAV:lockscope is missing', () => {
    expect(() =>
      parseLockInfoRequestBody(
        '<D:lockinfo xmlns:D="DAV:"><D:locktype><D:write/></D:locktype></D:lockinfo>',
      ),
    ).toThrow();
  });

  it('throws when DAV:locktype write is missing', () => {
    expect(() =>
      parseLockInfoRequestBody(
        '<D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope></D:lockinfo>',
      ),
    ).toThrow();
  });

  it('captures plain-text owner content, not just nested elements', () => {
    const result = parseLockInfoRequestBody(
      '<D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype><D:owner>Jane Doe</D:owner></D:lockinfo>',
    );
    expect(result.ownerInfo).toBe('Jane Doe');
  });
});
