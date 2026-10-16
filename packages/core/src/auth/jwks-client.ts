import { importJWK, type JWK } from 'jose';

/** At most one JWKS refresh per issuer per minute. */
const DEFAULT_MIN_REFRESH_INTERVAL_MS = 60_000;

/** A JWKS endpoint that does not answer within this time counts as a failed fetch. */
const FETCH_TIMEOUT_MS = 5000;

/** Options for {@link JwksClient}. */
export interface JwksClientOptions {
  /** Minimum time between two fetches, in milliseconds. Default one minute. */
  minRefreshIntervalMs?: number;
  /** HTTP client, injectable for tests. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /** Clock source, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

type VerificationKey = Awaited<ReturnType<typeof importJWK>>;

/**
 * Loads and caches the JSON Web Key Set of one OIDC issuer (M10),
 * indexed by `kid`. Keys are fetched lazily on first use and then served
 * from memory — validating a token with a known `kid` costs no network
 * call.
 *
 * A token signed with an unknown `kid` (typically after the issuer rotated
 * its keys) triggers a re-fetch, but never more than once per
 * `minRefreshIntervalMs`: otherwise anyone able to send requests could
 * make the server hammer the issuer by inventing `kid` values. Within
 * that window an unknown `kid` is simply unknown. A failed fetch counts
 * against the same limit and keeps the previously cached keys.
 *
 * Symmetric (`oct`) keys and keys marked for encryption are ignored: a
 * token whose signature could be forged by anyone who knows a shared
 * secret must never validate.
 */
export class JwksClient {
  private readonly keys = new Map<string, JWK>();
  private readonly minRefreshIntervalMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private lastFetchAt: number | null = null;
  private inFlight: Promise<void> | null = null;

  /** @param jwksUri - The issuer's explicitly configured JWKS URL. */
  constructor(
    private readonly jwksUri: string,
    options: JwksClientOptions = {},
  ) {
    this.minRefreshIntervalMs =
      options.minRefreshIntervalMs ?? DEFAULT_MIN_REFRESH_INTERVAL_MS;
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /**
   * Returns the verification key for `kid`, fetching or refreshing the
   * key set if allowed.
   *
   * @param alg - The token's signing algorithm, used to import the key.
   * @returns The key, or `null` if no such key is known (including when
   * a refresh was rate-limited or failed).
   */
  async getKey(kid: string, alg: string): Promise<VerificationKey | null> {
    let jwk = this.keys.get(kid);
    if (!jwk) {
      await this.refreshIfAllowed();
      jwk = this.keys.get(kid);
    }
    if (!jwk) {
      return null;
    }
    try {
      return await importJWK(jwk, alg);
    } catch {
      return null;
    }
  }

  private async refreshIfAllowed(): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (
      this.lastFetchAt !== null &&
      this.now() - this.lastFetchAt < this.minRefreshIntervalMs
    ) {
      return;
    }
    this.lastFetchAt = this.now();
    this.inFlight = this.fetchKeys().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async fetchKeys(): Promise<void> {
    try {
      const response = await this.fetchFn(this.jwksUri, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(body.keys)) {
        return;
      }
      const fresh = new Map<string, JWK>();
      for (const candidate of body.keys as JWK[]) {
        if (
          typeof candidate?.kid === 'string' &&
          candidate.kty !== undefined &&
          candidate.kty !== 'oct' &&
          (candidate.use === undefined || candidate.use === 'sig')
        ) {
          fresh.set(candidate.kid, candidate);
        }
      }
      this.keys.clear();
      for (const [kid, jwk] of fresh) {
        this.keys.set(kid, jwk);
      }
    } catch {
      // Unreachable issuer, bad JSON, timeout: keep the cached keys and
      // wait out the rate limit before trying again.
    }
  }
}
