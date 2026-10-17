import { describe, expect, it } from 'vitest';
import { AuthRateLimiter } from './auth-rate-limiter.js';
import { parseSecurityConfig } from './security-config.js';

function limiter(max = 3, windowMs = 60_000) {
  let now = 1_000_000;
  return {
    limiter: new AuthRateLimiter({ max, windowMs, now: () => now }),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('AuthRateLimiter', () => {
  it('blocks an address once it has used up its failures, with the time left', () => {
    const { limiter: l, advance } = limiter(3, 60_000);

    for (let i = 0; i < 2; i += 1) l.recordFailure('1.2.3.4');
    expect(l.retryAfterSeconds('1.2.3.4')).toBe(0);
    l.recordFailure('1.2.3.4');
    advance(10_000);

    expect(l.retryAfterSeconds('1.2.3.4')).toBe(50);
  });

  it('counts per address', () => {
    const { limiter: l } = limiter(2);
    l.recordFailure('1.1.1.1');
    l.recordFailure('1.1.1.1');

    expect(l.retryAfterSeconds('1.1.1.1')).toBeGreaterThan(0);
    expect(l.retryAfterSeconds('2.2.2.2')).toBe(0);
  });

  it('allows attempts again once the window has passed, with a fresh count', () => {
    const { limiter: l, advance } = limiter(2, 60_000);
    l.recordFailure('a');
    l.recordFailure('a');
    advance(60_000);

    expect(l.retryAfterSeconds('a')).toBe(0);
    l.recordFailure('a');
    expect(l.retryAfterSeconds('a')).toBe(0);
  });

  it('a success clears the counter', () => {
    const { limiter: l } = limiter(2);
    l.recordFailure('a');
    l.recordSuccess('a');
    l.recordFailure('a');

    expect(l.retryAfterSeconds('a')).toBe(0);
  });

  it('does not let refused requests extend the block (only failures are recorded)', () => {
    const { limiter: l, advance } = limiter(1, 60_000);
    l.recordFailure('a');
    for (let i = 0; i < 5; i += 1) {
      advance(1000);
      expect(l.retryAfterSeconds('a')).toBeGreaterThan(0);
    }
    advance(60_000);

    expect(l.retryAfterSeconds('a')).toBe(0);
  });

  it('forgets expired addresses, so memory does not grow without bound', () => {
    const { limiter: l, advance } = limiter(5, 60_000);
    for (let i = 0; i < 100; i += 1) l.recordFailure(`10.0.0.${i}`);
    expect(l.size).toBe(100);

    advance(120_000);
    l.recordFailure('someone-new');

    expect(l.size).toBe(1);
  });
});

describe('parseSecurityConfig', () => {
  it('defaults to ten failures per fifteen minutes and no proxy', () => {
    expect(parseSecurityConfig({})).toEqual({
      rateLimit: { max: 10, windowMs: 15 * 60_000 },
      behindTlsProxy: false,
    });
  });

  it('reads the limit, the window and the proxy flag', () => {
    expect(
      parseSecurityConfig({
        DAVNODE_AUTH_RATE_LIMIT_MAX: '3',
        DAVNODE_AUTH_RATE_LIMIT_WINDOW_MINUTES: '1',
        DAVNODE_BEHIND_TLS_PROXY: 'TRUE',
      }),
    ).toEqual({
      rateLimit: { max: 3, windowMs: 60_000 },
      behindTlsProxy: true,
    });
  });

  it('0 switches the limit off', () => {
    expect(
      parseSecurityConfig({ DAVNODE_AUTH_RATE_LIMIT_MAX: '0' }).rateLimit,
    ).toBeNull();
  });

  it.each([
    [{ DAVNODE_AUTH_RATE_LIMIT_MAX: 'many' }, /DAVNODE_AUTH_RATE_LIMIT_MAX/],
    [{ DAVNODE_AUTH_RATE_LIMIT_MAX: '-1' }, /DAVNODE_AUTH_RATE_LIMIT_MAX/],
    [{ DAVNODE_AUTH_RATE_LIMIT_WINDOW_MINUTES: '0' }, /at least 1/],
    [{ DAVNODE_AUTH_RATE_LIMIT_WINDOW_MINUTES: '1.5' }, /WINDOW_MINUTES/],
    [{ DAVNODE_BEHIND_TLS_PROXY: 'yes' }, /"true" or "false"/],
  ])('rejects %j', (env, message) => {
    expect(() => parseSecurityConfig(env)).toThrow(message);
  });
});
