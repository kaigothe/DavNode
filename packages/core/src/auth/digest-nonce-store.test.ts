import { describe, expect, it } from 'vitest';
import {
  DigestNonceStore,
  startDigestNonceSweep,
} from './digest-nonce-store.js';

describe('DigestNonceStore', () => {
  function storeWithClock(
    options: { ttlMs?: number; staleGraceMs?: number } = {},
  ) {
    let now = 1_000_000;
    const store = new DigestNonceStore({ ...options, now: () => now });
    return {
      store,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  it('issues unpredictable, distinct nonces', () => {
    const { store } = storeWithClock();

    const nonces = new Set(
      Array.from({ length: 50 }, () => store.generateNonce()),
    );

    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('accepts a fresh nonce with nc 1 and rejects the same nc again as a replay', () => {
    const { store } = storeWithClock();
    const nonce = store.generateNonce();

    expect(store.validateAndConsumeNonce(nonce, 1)).toBe('valid');
    expect(store.validateAndConsumeNonce(nonce, 1)).toBe('replay');
  });

  it('requires nc to keep increasing, but allows gaps', () => {
    const { store } = storeWithClock();
    const nonce = store.generateNonce();

    expect(store.validateAndConsumeNonce(nonce, 2)).toBe('valid');
    expect(store.validateAndConsumeNonce(nonce, 1)).toBe('replay');
    expect(store.validateAndConsumeNonce(nonce, 5)).toBe('valid');
    expect(store.validateAndConsumeNonce(nonce, 0)).toBe('replay');
    expect(store.validateAndConsumeNonce(nonce, Number.NaN)).toBe('replay');
  });

  it('reports a never issued nonce as unknown', () => {
    const { store } = storeWithClock();

    expect(store.validateAndConsumeNonce('f'.repeat(32), 1)).toBe('unknown');
  });

  it('reports an expired nonce as stale, not unknown', () => {
    const { store, advance } = storeWithClock({ ttlMs: 1000 });
    const nonce = store.generateNonce();

    advance(999);
    expect(store.validateAndConsumeNonce(nonce, 1)).toBe('valid');
    advance(1);

    expect(store.validateAndConsumeNonce(nonce, 2)).toBe('stale');
  });

  it('sweeps expired entries after the stale grace period, so memory stays bounded', () => {
    const { store, advance } = storeWithClock({
      ttlMs: 1000,
      staleGraceMs: 5000,
    });
    const nonce = store.generateNonce();
    for (let i = 0; i < 99; i += 1) {
      store.generateNonce();
    }
    expect(store.size).toBe(100);

    advance(1000);
    expect(store.sweep()).toBe(0);
    expect(store.validateAndConsumeNonce(nonce, 1)).toBe('stale');

    advance(5000);
    expect(store.sweep()).toBe(100);
    expect(store.size).toBe(0);
    expect(store.validateAndConsumeNonce(nonce, 1)).toBe('unknown');
  });

  it('keeps still-valid nonces when sweeping', () => {
    const { store, advance } = storeWithClock({
      ttlMs: 10_000,
      staleGraceMs: 1000,
    });
    const old = store.generateNonce();
    advance(20_000);
    const fresh = store.generateNonce();

    expect(store.sweep()).toBe(1);
    expect(store.validateAndConsumeNonce(old, 1)).toBe('unknown');
    expect(store.validateAndConsumeNonce(fresh, 1)).toBe('valid');
  });

  it('startDigestNonceSweep rejects an invalid cron expression and schedules a valid one', () => {
    const store = new DigestNonceStore();

    expect(() => startDigestNonceSweep(store, 'not a cron')).toThrow(/cron/i);
    const task = startDigestNonceSweep(store);
    void task.stop();
  });
});
