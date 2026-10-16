import {
  parseOAuth2IssuersConfig,
  type OAuth2IssuerConfig,
} from '@davnode/core';

/** An authentication scheme the server can offer. */
export type AuthProviderName = 'basic' | 'digest' | 'oauth2';

const KNOWN_PROVIDERS: readonly AuthProviderName[] = [
  'basic',
  'digest',
  'oauth2',
];

/** The server's authentication setup, resolved from the environment by {@link parseAuthConfig}. */
export interface AuthConfig {
  /** Active schemes in the order their challenges are offered. */
  providers: readonly AuthProviderName[];
  /** Realm for the Basic, Digest and Bearer challenges. */
  realm: string;
  /** Trusted OIDC issuers; non-empty whenever `oauth2` is active. */
  oauth2Issuers: readonly OAuth2IssuerConfig[];
}

/** What `createApp` uses when it is given no {@link AuthConfig}: Basic only, exactly as before M10. */
export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  providers: ['basic'],
  realm: 'davnode',
  oauth2Issuers: [],
};

/**
 * Reads the authentication setup (M10,
 * milestones/M10-extended-auth/06-provider-management):
 *
 * - `DAVNODE_AUTH_PROVIDERS`: comma-separated subset of
 *   `basic,digest,oauth2`; default `basic`.
 * - `DAVNODE_AUTH_REALM`: realm for the challenges; default `davnode`.
 *   Changing it invalidates stored Digest credentials (their HA1
 *   includes the realm) until each user's password is set again.
 * - `DAVNODE_OAUTH2_ISSUERS`: JSON array of trusted issuers, required
 *   when `oauth2` is active.
 *
 * @throws An `Error` with a clear message for an unknown or empty
 * provider list, or for `oauth2` without any configured issuer — the
 * server must refuse to start rather than silently run without a login
 * method the administrator asked for.
 */
export function parseAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const raw = env.DAVNODE_AUTH_PROVIDERS;
  const names =
    raw === undefined || raw.trim() === ''
      ? ['basic']
      : raw.split(',').map((name) => name.trim().toLowerCase());

  const providers: AuthProviderName[] = [];
  for (const name of names) {
    if (!(KNOWN_PROVIDERS as readonly string[]).includes(name)) {
      throw new Error(
        `Unknown auth provider "${name}" in DAVNODE_AUTH_PROVIDERS. Known providers: ${KNOWN_PROVIDERS.join(', ')}.`,
      );
    }
    if (!providers.includes(name as AuthProviderName)) {
      providers.push(name as AuthProviderName);
    }
  }

  const oauth2Issuers = parseOAuth2IssuersConfig(env.DAVNODE_OAUTH2_ISSUERS);
  if (providers.includes('oauth2') && oauth2Issuers.length === 0) {
    throw new Error(
      'The oauth2 auth provider is enabled but DAVNODE_OAUTH2_ISSUERS configures no issuer.',
    );
  }

  const realm = env.DAVNODE_AUTH_REALM?.trim();
  return {
    providers,
    realm: realm ? realm : DEFAULT_AUTH_CONFIG.realm,
    oauth2Issuers: providers.includes('oauth2') ? oauth2Issuers : [],
  };
}
