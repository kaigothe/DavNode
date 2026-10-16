import { randomBytes } from 'node:crypto';
import { schedule, validate, type ScheduledTask } from 'node-cron';

/** Default nonce lifetime: long enough for a client to reuse one across a burst of requests, short enough to bound replay windows. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Default time an expired nonce is remembered (so it can still be told apart from a never-issued one). */
const DEFAULT_STALE_GRACE_MS = 60 * 60 * 1000;

/** Default cap on remembered nonces; see {@link DigestNonceStoreOptions.maxEntries}. */
const DEFAULT_MAX_ENTRIES = 100_000;

/** Every five minutes. */
const DEFAULT_SWEEP_SCHEDULE = '*/5 * * * *';

/** Options for {@link DigestNonceStore}. */
export interface DigestNonceStoreOptions {
  /** How long an issued nonce stays valid, in milliseconds. Default 5 minutes. */
  ttlMs?: number;
  /**
   * How long an *expired* nonce is still remembered, in milliseconds,
   * so a late request reports `'stale'` (the client retries silently
   * with a fresh nonce) rather than `'unknown'` (the client re-prompts
   * for the password). Default 1 hour.
   */
  staleGraceMs?: number;
  /**
   * Upper bound on remembered nonces. Every unauthenticated request
   * mints one, so without a cap a flood of challenges could grow the
   * map faster than the sweep shrinks it; once full, the oldest nonces
   * are dropped (a legitimate client holding one then simply gets a new
   * challenge). Default 100,000.
   */
  maxEntries?: number;
  /** Clock source, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/** Outcome of {@link DigestNonceStore.validateAndConsumeNonce}. */
export type NonceValidation = 'valid' | 'stale' | 'replay' | 'unknown';

interface NonceEntry {
  expiresAt: number;
  highestNc: number;
}

/**
 * In-process store of the nonces handed out in Digest challenges
 * (RFC 7616 §3.3; M10). It makes replays detectable — a `(nonce, nc)`
 * pair is only accepted once, and `nc` must keep increasing — and lets
 * the HTTP layer answer an expired nonce with `stale=true`.
 *
 * Deliberately in-memory, like the in-process cron jobs
 * (planning/01-decisions.md, Runde 16 and 25): correct for a single
 * server instance, would need an external store (e.g. Redis) before
 * horizontal scaling.
 *
 * Expiry is lazy: an expired nonce is simply treated as expired when it
 * is looked up, so correctness never depends on cleanup. {@link sweep}
 * (scheduled by {@link startDigestNonceSweep}) only bounds memory.
 */
export class DigestNonceStore {
  private readonly entries = new Map<string, NonceEntry>();
  private readonly ttlMs: number;
  private readonly staleGraceMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: DigestNonceStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.staleGraceMs = options.staleGraceMs ?? DEFAULT_STALE_GRACE_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  /** Number of nonces currently held (valid or remembered-as-expired). */
  get size(): number {
    return this.entries.size;
  }

  /** Issues a new unpredictable nonce (128 random bits, hex) valid for the configured TTL. */
  generateNonce(): string {
    const nonce = randomBytes(16).toString('hex');
    this.entries.set(nonce, {
      expiresAt: this.now() + this.ttlMs,
      highestNc: 0,
    });
    // Maps iterate in insertion order, so the first key is the oldest.
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return nonce;
  }

  /**
   * Checks a request's `(nonce, nc)` and, if acceptable, records it.
   *
   * @param nc - The numeric value of the request's hexadecimal `nc`
   * (nonce count); must be higher than any value accepted before for
   * this nonce.
   * @returns `'unknown'` if the nonce was never issued (or has been
   * swept); `'stale'` if it has expired; `'replay'` if `nc` does not
   * exceed the highest value seen; otherwise `'valid'`.
   */
  validateAndConsumeNonce(nonce: string, nc: number): NonceValidation {
    const entry = this.entries.get(nonce);
    if (!entry) {
      return 'unknown';
    }
    if (this.now() >= entry.expiresAt) {
      return 'stale';
    }
    if (!Number.isSafeInteger(nc) || nc <= entry.highestNc) {
      return 'replay';
    }
    entry.highestNc = nc;
    return 'valid';
  }

  /**
   * Removes every nonce that expired more than the stale grace period
   * ago.
   *
   * @returns How many nonces were removed.
   */
  sweep(): number {
    const cutoff = this.now() - this.staleGraceMs;
    let removed = 0;
    for (const [nonce, entry] of this.entries) {
      if (entry.expiresAt <= cutoff) {
        this.entries.delete(nonce);
        removed += 1;
      }
    }
    return removed;
  }
}

/**
 * Schedules {@link DigestNonceStore.sweep} as an in-process `node-cron`
 * job, every five minutes unless `cronExpression` says otherwise.
 *
 * @throws An `Error` if `cronExpression` is not a valid cron expression.
 */
export function startDigestNonceSweep(
  store: DigestNonceStore,
  cronExpression: string = DEFAULT_SWEEP_SCHEDULE,
): ScheduledTask {
  if (!validate(cronExpression)) {
    throw new Error(
      `Invalid Digest nonce sweep cron expression: "${cronExpression}".`,
    );
  }
  return schedule(cronExpression, () => {
    store.sweep();
  });
}
