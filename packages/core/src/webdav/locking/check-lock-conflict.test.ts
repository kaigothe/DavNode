import { describe, expect, it } from 'vitest';
import type { EffectiveLock } from './collect-locks.js';
import { wouldConflict } from './check-lock-conflict.js';

function lock(scope: 'exclusive' | 'shared'): EffectiveLock {
  return { scope } as EffectiveLock;
}

describe('wouldConflict', () => {
  it('no existing locks never conflicts, regardless of requested scope', () => {
    expect(wouldConflict([], 'exclusive')).toBe(false);
    expect(wouldConflict([], 'shared')).toBe(false);
  });

  it('a requested exclusive lock conflicts with an existing shared lock', () => {
    expect(wouldConflict([lock('shared')], 'exclusive')).toBe(true);
  });

  it('a requested exclusive lock conflicts with an existing exclusive lock', () => {
    expect(wouldConflict([lock('exclusive')], 'exclusive')).toBe(true);
  });

  it('two shared locks do not conflict', () => {
    expect(wouldConflict([lock('shared')], 'shared')).toBe(false);
  });

  it('a requested shared lock conflicts with an existing exclusive lock', () => {
    expect(wouldConflict([lock('exclusive')], 'shared')).toBe(true);
  });

  it('a requested shared lock conflicts if any existing lock among several is exclusive', () => {
    expect(
      wouldConflict([lock('shared'), lock('shared'), lock('exclusive')], 'shared'),
    ).toBe(true);
  });
});
