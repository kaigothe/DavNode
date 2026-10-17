/** Options for {@link AuthRateLimiter}. */
export interface AuthRateLimiterOptions {
  /** Failed attempts per client address within one window before further requests are refused. */
  max: number;
  /** Length of the counting window, in milliseconds. */
  windowMs: number;
  /** Clock source, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface Window {
  count: number;
  windowStart: number;
}

/** Upper bound on addresses tracked at once; see {@link AuthRateLimiter}. */
const MAX_TRACKED_ADDRESSES = 100_000;

/**
 * Counts failed login attempts per client address, to stop password
 * guessing (M12, milestones/M12-hardening/03-security-hardening). One
 * counter per address serves all three schemes: switching between Basic,
 * Digest and OAuth2 does not buy an attacker a second budget.
 *
 * - A fixed window per address starts at its first failure; once `max`
 *   failures are in the current window the address is blocked until the
 *   window ends. Refused requests are not counted, so the block does not
 *   extend itself.
 * - A successful login clears the address's counter, so a legitimate user
 *   who mistyped a few times is not locked out once they get it right.
 *   (Consequence: an attacker who owns an account can interleave one
 *   successful login among their guesses to reset the count; the limiter
 *   slows blind guessing, it is not a defence against that.)
 *
 * **Not** protected against: attacks spread over many addresses — this is
 * a per-address counter, in memory, for one server instance (like the
 * Digest nonce store and the cron jobs). Behind a reverse proxy the real
 * client address must reach the app (`DAVNODE_BEHIND_TLS_PROXY`), otherwise
 * all clients share the proxy's address and one bad guesser blocks everyone.
 *
 * Memory is bounded: expired windows are dropped as they are met and
 * periodically swept, and at most {@link MAX_TRACKED_ADDRESSES} addresses
 * are kept, oldest first.
 */
export class AuthRateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private lastSweep = 0;

  constructor(options: AuthRateLimiterOptions) {
    this.max = options.max;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  /**
   * Whether `address` has used up its failures in the current window.
   *
   * @returns The number of seconds until it may try again, or `0` if it
   * is not blocked.
   */
  retryAfterSeconds(address: string): number {
    const window = this.windows.get(address);
    if (!window) return 0;
    const now = this.now();
    if (now - window.windowStart >= this.windowMs) {
      this.windows.delete(address);
      return 0;
    }
    if (window.count < this.max) return 0;
    return Math.max(
      1,
      Math.ceil((window.windowStart + this.windowMs - now) / 1000),
    );
  }

  /** Records one failed attempt from `address`. */
  recordFailure(address: string): void {
    const now = this.now();
    this.sweepIfDue(now);
    const window = this.windows.get(address);
    if (!window || now - window.windowStart >= this.windowMs) {
      this.windows.delete(address); // re-insert at the end: newest last
      this.windows.set(address, { count: 1, windowStart: now });
    } else {
      window.count += 1;
    }
    while (this.windows.size > MAX_TRACKED_ADDRESSES) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }

  /** Clears `address`'s counter after a successful login. */
  recordSuccess(address: string): void {
    this.windows.delete(address);
  }

  /** Number of addresses currently tracked. */
  get size(): number {
    return this.windows.size;
  }

  private sweepIfDue(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [address, window] of this.windows) {
      if (now - window.windowStart >= this.windowMs) {
        this.windows.delete(address);
      }
    }
  }
}
