import type { AuthRateLimiterOptions } from './auth-rate-limiter.js';

/** Defaults: ten failures per fifteen minutes. */
const DEFAULT_MAX = 10;
const DEFAULT_WINDOW_MINUTES = 15;

/** Security-related settings resolved from the environment. */
export interface SecurityConfig {
  /** Settings for the failed-login limiter, or `null` when it is switched off. */
  rateLimit: Pick<AuthRateLimiterOptions, 'max' | 'windowMs'> | null;
  /** The server runs behind one TLS-terminating reverse proxy. */
  behindTlsProxy: boolean;
}

function positiveInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}".`);
  }
  return value;
}

/**
 * Reads:
 *
 * - `DAVNODE_AUTH_RATE_LIMIT_MAX`: failed attempts per window and client
 *   address before answering `429` (default 10; `0` switches the limit off);
 * - `DAVNODE_AUTH_RATE_LIMIT_WINDOW_MINUTES`: the window (default 15);
 * - `DAVNODE_BEHIND_TLS_PROXY`: `true` when a reverse proxy terminates TLS in
 *   front of the app. Then HSTS is sent and the client address is taken
 *   from the proxy's `X-Forwarded-For` (one hop).
 *
 * @throws An `Error` for a malformed number or boolean.
 */
export function parseSecurityConfig(env: NodeJS.ProcessEnv): SecurityConfig {
  const max = positiveInteger(
    'DAVNODE_AUTH_RATE_LIMIT_MAX',
    env.DAVNODE_AUTH_RATE_LIMIT_MAX,
    DEFAULT_MAX,
  );
  const minutes = positiveInteger(
    'DAVNODE_AUTH_RATE_LIMIT_WINDOW_MINUTES',
    env.DAVNODE_AUTH_RATE_LIMIT_WINDOW_MINUTES,
    DEFAULT_WINDOW_MINUTES,
  );
  if (max > 0 && minutes === 0) {
    throw new Error(
      'DAVNODE_AUTH_RATE_LIMIT_WINDOW_MINUTES must be at least 1.',
    );
  }

  const proxy = env.DAVNODE_BEHIND_TLS_PROXY?.trim().toLowerCase();
  if (proxy !== undefined && !['', 'true', 'false'].includes(proxy)) {
    throw new Error(
      `DAVNODE_BEHIND_TLS_PROXY must be "true" or "false", got "${env.DAVNODE_BEHIND_TLS_PROXY}".`,
    );
  }

  return {
    rateLimit: max === 0 ? null : { max, windowMs: minutes * 60_000 },
    behindTlsProxy: proxy === 'true',
  };
}

/** What `createApp` uses without configuration: the default limit, no proxy. */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  rateLimit: { max: DEFAULT_MAX, windowMs: DEFAULT_WINDOW_MINUTES * 60_000 },
  behindTlsProxy: false,
};
