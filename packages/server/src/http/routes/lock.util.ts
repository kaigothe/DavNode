/**
 * Default granted lock lifetime (RFC 4918 §10.7) when the client sends
 * no `Timeout` header, or none of its preferences parse: one hour.
 * Project policy — RFC 4918 leaves the actual grant entirely up to the
 * server.
 */
export const DEFAULT_LOCK_TIMEOUT_SECONDS = 3600;

/**
 * The longest lifetime this server ever grants a lock: 24 hours. A
 * requested `Infinite`, or a `Second-N` longer than this, is capped to
 * this value rather than rejected.
 */
export const MAX_LOCK_TIMEOUT_SECONDS = 86400;

const SECOND_TIMEOUT_PATTERN = /^Second-(\d+)$/;

/**
 * Chooses the granted lock lifetime, in seconds, from a `Timeout`
 * request header (RFC 4918 §10.7): a comma-separated preference list
 * (e.g. `Second-3600, Infinite`), each entry either `Second-N` or
 * `Infinite`. Picks the first entry that parses, capped at
 * {@link MAX_LOCK_TIMEOUT_SECONDS} — an entry this server can't make
 * sense of is skipped in favor of the next preference, not treated as a
 * hard failure.
 *
 * @param headerValue - The raw `Timeout` header value, or `undefined`
 * if the client didn't send one.
 * @returns The granted lifetime in seconds — {@link DEFAULT_LOCK_TIMEOUT_SECONDS}
 * if there's no header or no preference in it parses, otherwise the
 * first preference that does, capped at {@link MAX_LOCK_TIMEOUT_SECONDS}.
 */
export function grantLockTimeout(headerValue: string | undefined): number {
  if (headerValue === undefined) {
    return DEFAULT_LOCK_TIMEOUT_SECONDS;
  }
  for (const preference of headerValue.split(',').map((p) => p.trim())) {
    if (preference === 'Infinite') {
      return MAX_LOCK_TIMEOUT_SECONDS;
    }
    const match = SECOND_TIMEOUT_PATTERN.exec(preference);
    if (match) {
      return Math.min(Number(match[1]), MAX_LOCK_TIMEOUT_SECONDS);
    }
  }
  return DEFAULT_LOCK_TIMEOUT_SECONDS;
}

/**
 * A lock's `expiresAt`, `timeoutSeconds` after `from` (defaults to
 * now) — RFC 4918 §7 measures a lock's lifetime from the moment it's
 * granted (or refreshed).
 */
export function computeLockExpiresAt(
  timeoutSeconds: number,
  from: Date = new Date(),
): Date {
  return new Date(from.getTime() + timeoutSeconds * 1000);
}

const IF_HEADER_STATE_TOKEN = /<([^>]+)>/;

/**
 * Extracts the single lock token from an `If` header on a lock-refresh
 * LOCK request (RFC 4918 §9.10.2: "the client... MUST specify which
 * lock to refresh by using the 'If' header with a single lock
 * token... only one lock may be refreshed at a time"). Handles exactly
 * that simple, untagged, single-condition form (`If: (<urn:uuid:...>)`,
 * RFC 4918 §10.4.6) — not the full `If` header grammar (multiple
 * lists, tagged lists, ETag conditions, `Not`), which the lock
 * *enforcement* middleware
 * (`milestones/M4-locking-sync/05-lock-enforcement-middleware`) needs
 * to parse in full for every mutating method, refresh included.
 *
 * @returns The first `Coded-URL` token found (RFC 4918 §10.5), or
 * `null` if `headerValue` is `undefined` or contains no `<...>` token
 * at all.
 */
export function extractIfHeaderLockToken(
  headerValue: string | undefined,
): string | null {
  if (headerValue === undefined) {
    return null;
  }
  const match = IF_HEADER_STATE_TOKEN.exec(headerValue);
  return match ? match[1] : null;
}
