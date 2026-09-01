import { describe, expect, it } from 'vitest';
import type { EffectiveLock } from './collect-locks.js';
import { hasValidLockToken } from './check-lock-token.js';

function lock(token: string): EffectiveLock {
  return { token } as EffectiveLock;
}

describe('hasValidLockToken', () => {
  it('a resource with no effective locks is satisfied by an empty token set', () => {
    expect(hasValidLockToken([], new Set())).toBe(true);
  });

  it('a resource with no effective locks is satisfied even by unrelated tokens', () => {
    expect(hasValidLockToken([], new Set(['urn:uuid:unrelated']))).toBe(true);
  });

  it('a single effective lock is satisfied when its token is submitted', () => {
    expect(
      hasValidLockToken([lock('urn:uuid:a')], new Set(['urn:uuid:a'])),
    ).toBe(true);
  });

  it('a single effective lock is not satisfied when no token is submitted', () => {
    expect(hasValidLockToken([lock('urn:uuid:a')], new Set())).toBe(false);
  });

  it('a single effective lock is not satisfied by a different token', () => {
    expect(
      hasValidLockToken([lock('urn:uuid:a')], new Set(['urn:uuid:b'])),
    ).toBe(false);
  });

  it('requires every effective lock to be covered, not just one of several', () => {
    const locks = [lock('urn:uuid:a'), lock('urn:uuid:b')];
    expect(hasValidLockToken(locks, new Set(['urn:uuid:a']))).toBe(false);
    expect(
      hasValidLockToken(locks, new Set(['urn:uuid:a', 'urn:uuid:b'])),
    ).toBe(true);
  });
});
