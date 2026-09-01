import { describe, expect, it } from 'vitest';
import {
  computeLockExpiresAt,
  DEFAULT_LOCK_TIMEOUT_SECONDS,
  extractIfHeaderLockToken,
  grantLockTimeout,
  MAX_LOCK_TIMEOUT_SECONDS,
} from './lock.util.js';

describe('grantLockTimeout', () => {
  it('defaults to Second-3600 when there is no Timeout header', () => {
    expect(grantLockTimeout(undefined)).toBe(DEFAULT_LOCK_TIMEOUT_SECONDS);
  });

  it('grants a requested Second-N value under the cap as-is', () => {
    expect(grantLockTimeout('Second-1800')).toBe(1800);
  });

  it('caps a requested Infinite at the maximum instead of rejecting it', () => {
    expect(grantLockTimeout('Infinite')).toBe(MAX_LOCK_TIMEOUT_SECONDS);
  });

  it('caps a requested Second-N above the maximum', () => {
    expect(grantLockTimeout('Second-999999')).toBe(MAX_LOCK_TIMEOUT_SECONDS);
  });

  it('picks the first preference in a comma-separated list', () => {
    expect(grantLockTimeout('Second-1800, Infinite')).toBe(1800);
    expect(grantLockTimeout('Infinite, Second-1800')).toBe(
      MAX_LOCK_TIMEOUT_SECONDS,
    );
  });

  it('skips an unparseable preference in favor of the next one', () => {
    expect(grantLockTimeout('garbage, Second-100')).toBe(100);
  });

  it('falls back to the default when no preference parses at all', () => {
    expect(grantLockTimeout('garbage')).toBe(DEFAULT_LOCK_TIMEOUT_SECONDS);
  });
});

describe('computeLockExpiresAt', () => {
  it('adds timeoutSeconds to the reference time', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(computeLockExpiresAt(3600, from)).toEqual(
      new Date('2026-01-01T01:00:00.000Z'),
    );
  });

  it('defaults the reference time to now', () => {
    const before = Date.now();
    const expiresAt = computeLockExpiresAt(60);
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 60_000);
  });
});

describe('extractIfHeaderLockToken', () => {
  it('returns null when there is no If header', () => {
    expect(extractIfHeaderLockToken(undefined)).toBeNull();
  });

  it('extracts the token from a simple untagged If header', () => {
    expect(
      extractIfHeaderLockToken(
        '(<urn:uuid:e71d4fae-5dec-22d6-fea5-00a0c91e6be4>)',
      ),
    ).toBe('urn:uuid:e71d4fae-5dec-22d6-fea5-00a0c91e6be4');
  });

  it('returns null when the header has no Coded-URL token at all', () => {
    expect(extractIfHeaderLockToken('(["some etag"])')).toBeNull();
  });

  it('extracts the first token when an ETag condition is also present', () => {
    expect(
      extractIfHeaderLockToken('(<urn:uuid:abc-123> ["some etag"])'),
    ).toBe('urn:uuid:abc-123');
  });
});
