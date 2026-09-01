import { describe, expect, it } from 'vitest';
import {
  isDestinationWithinSource,
  parseDestinationHeader,
  parseOverwriteHeader,
} from './copy-move.util.js';

describe('parseDestinationHeader', () => {
  it('parses an absolute URI', () => {
    expect(
      parseDestinationHeader(
        'http://localhost:8080/dav/acme/files/sub/report.txt',
      ),
    ).toEqual({ tenantSlug: 'acme', segments: ['sub', 'report.txt'] });
  });

  it('parses a bare absolute path', () => {
    expect(parseDestinationHeader('/dav/acme/files/report.txt')).toEqual({
      tenantSlug: 'acme',
      segments: ['report.txt'],
    });
  });

  it('decodes percent-encoded segments', () => {
    expect(parseDestinationHeader('/dav/acme/files/my%20file.txt')).toEqual({
      tenantSlug: 'acme',
      segments: ['my file.txt'],
    });
  });

  it('parses the tenant files root with no trailing segments', () => {
    expect(parseDestinationHeader('/dav/acme/files')).toEqual({
      tenantSlug: 'acme',
      segments: [],
    });
  });

  it('ignores a trailing slash', () => {
    expect(parseDestinationHeader('/dav/acme/files/sub/')).toEqual({
      tenantSlug: 'acme',
      segments: ['sub'],
    });
  });

  it('returns null for a missing header', () => {
    expect(parseDestinationHeader(undefined)).toBeNull();
  });

  it('returns null for a path outside /dav/{tenant}/files', () => {
    expect(parseDestinationHeader('/dav/acme/principals/users/123')).toBeNull();
  });
});

describe('parseOverwriteHeader', () => {
  it('defaults to true when absent', () => {
    expect(parseOverwriteHeader(undefined)).toBe(true);
  });

  it('is true for "T"', () => {
    expect(parseOverwriteHeader('T')).toBe(true);
  });

  it('is false for "F"', () => {
    expect(parseOverwriteHeader('F')).toBe(false);
  });
});

describe('isDestinationWithinSource', () => {
  it('is true for the exact same path', () => {
    expect(isDestinationWithinSource(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('is true for a descendant path', () => {
    expect(isDestinationWithinSource(['a'], ['a', 'b'])).toBe(true);
  });

  it('is false for an unrelated path', () => {
    expect(isDestinationWithinSource(['a'], ['b'])).toBe(false);
  });

  it('is false for a sibling that merely shares a name prefix', () => {
    expect(isDestinationWithinSource(['a'], ['ab'])).toBe(false);
  });

  it('is false for the parent of the source', () => {
    expect(isDestinationWithinSource(['a', 'b'], ['a'])).toBe(false);
  });
});
