import { decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import type { DataSource } from 'typeorm';
import { Credential } from '../entities/credential.entity.js';
import { Principal } from '../entities/principal.entity.js';
import { Tenant } from '../entities/tenant.entity.js';
import { User } from '../entities/user.entity.js';
import type { AuthProvider } from './auth-provider.interface.js';
import { JwksClient, type JwksClientOptions } from './jwks-client.js';
import type { OAuth2IssuerConfig } from './oauth2-config.js';

/**
 * The only signature algorithms accepted: asymmetric ones. `none` and
 * the HMAC family (`HS*`) are deliberately absent — with a token whose
 * header the *client* controls, accepting them is the classic JWT
 * forgery (a self-signed `none` token, or an `HS256` token keyed with
 * the issuer's public key).
 */
const ALLOWED_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
] as const;

/** Tokens larger than this are rejected before any parsing. */
const MAX_TOKEN_LENGTH = 16 * 1024;

/** Tolerated clock skew between the issuer and this server, in seconds. */
const CLOCK_TOLERANCE_SECONDS = 30;

/** Options for {@link OAuth2AuthProvider}. */
export interface OAuth2AuthProviderOptions {
  /** Passed to every issuer's {@link JwksClient}. */
  jwks?: JwksClientOptions;
  /** Clock used for `exp`/`nbf`, injectable for tests. Defaults to the system clock. */
  currentDate?: () => Date;
}

/**
 * The `'oauth2'` {@link AuthProvider} (M10): validates a bearer JWT issued
 * by one of the configured OIDC issuers and maps it to the local user
 * whose `oauth2` credential carries the token's `(iss, sub)`. DavNode is
 * only a resource server — it never issues tokens, and it never creates
 * users from tokens (no JIT provisioning): a valid token of an
 * unlinked identity authenticates nobody.
 *
 * Checks, in order, each failing with `null` and no detail: size,
 * `iss` matches a configured issuer (checked on the *unverified* payload
 * only to pick which issuer's keys to use, so unconfigured issuers never
 * cause a JWKS fetch), asymmetric `alg`, a `kid` known to the issuer's
 * JWKS, then signature, `exp` (required), `nbf`, `iss` and `aud`, a
 * non-empty `sub`, a linked `oauth2` credential, and finally that the
 * linked user belongs to the tenant the request is for.
 */
export class OAuth2AuthProvider implements AuthProvider {
  readonly type = 'oauth2';
  private readonly issuers = new Map<
    string,
    { config: OAuth2IssuerConfig; jwks: JwksClient }
  >();

  /**
   * @param dataSource - An initialized DataSource to read credentials from.
   * @param issuers - The trusted issuers.
   * @param options - See {@link OAuth2AuthProviderOptions}.
   */
  constructor(
    private readonly dataSource: DataSource,
    issuers: readonly OAuth2IssuerConfig[],
    private readonly options: OAuth2AuthProviderOptions = {},
  ) {
    for (const config of issuers) {
      this.issuers.set(config.issuer, {
        config,
        jwks: new JwksClient(config.jwksUri, options.jwks),
      });
    }
  }

  /**
   * Verifies a bearer token.
   *
   * @param input - Expected to be `{ token, tenantSlug }`, both strings.
   * @returns The linked user's principal, or `null` for any failure.
   */
  async verify(input: unknown): Promise<Principal | null> {
    const record = (input ?? {}) as Record<string, unknown>;
    const { token, tenantSlug } = record;
    if (
      typeof token !== 'string' ||
      typeof tenantSlug !== 'string' ||
      token.length === 0 ||
      token.length > MAX_TOKEN_LENGTH
    ) {
      return null;
    }

    let issuerName: unknown;
    let alg: unknown;
    let kid: unknown;
    try {
      issuerName = decodeJwt(token).iss;
      ({ alg, kid } = decodeProtectedHeader(token));
    } catch {
      return null;
    }
    const entry =
      typeof issuerName === 'string' ? this.issuers.get(issuerName) : undefined;
    if (
      !entry ||
      typeof kid !== 'string' ||
      !(ALLOWED_ALGORITHMS as readonly unknown[]).includes(alg)
    ) {
      return null;
    }

    const key = await entry.jwks.getKey(kid, alg as string);
    if (!key) {
      return null;
    }

    let subject: unknown;
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: entry.config.issuer,
        audience: entry.config.audience,
        algorithms: [alg as string],
        requiredClaims: ['exp', 'sub'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: this.options.currentDate?.(),
      });
      subject = payload.sub;
    } catch {
      return null;
    }
    if (typeof subject !== 'string' || subject === '') {
      return null;
    }

    const credential = await this.dataSource
      .getRepository(Credential)
      .findOneBy({
        type: 'oauth2',
        oauth2Issuer: entry.config.issuer,
        oauth2Subject: subject,
      });
    const user = credential
      ? await this.dataSource
          .getRepository(User)
          .findOneBy({ id: credential.userId })
      : null;
    if (!user) {
      return null;
    }
    const tenant = await this.dataSource
      .getRepository(Tenant)
      .findOneBy({ id: user.tenantId });
    if (tenant?.slug !== tenantSlug) {
      return null;
    }

    return this.dataSource
      .getRepository(Principal)
      .findOneBy({ id: user.principalId });
  }
}
