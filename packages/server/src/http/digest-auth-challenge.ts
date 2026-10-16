import type { DigestNonceStore } from '@davnode/core';
import { randomBytes } from 'node:crypto';

const quote = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Builds a `WWW-Authenticate: Digest` header value per RFC 7616 §3.3:
 * `qop="auth"` only, `algorithm=SHA-256` only (no MD5), the given
 * `nonce` and `opaque`, and `stale=true` when the client's credentials
 * were probably right but its nonce had expired.
 */
export function buildDigestChallenge(params: {
  realm: string;
  nonce: string;
  opaque: string;
  stale?: boolean;
}): string {
  const parts = [
    `realm=${quote(params.realm)}`,
    'qop="auth"',
    'algorithm=SHA-256',
    `nonce=${quote(params.nonce)}`,
    `opaque=${quote(params.opaque)}`,
  ];
  if (params.stale) {
    parts.push('stale=true');
  }
  return `Digest ${parts.join(', ')}`;
}

/** Issues Digest challenges, each with a fresh nonce from a {@link DigestNonceStore}. */
export interface DigestChallengeFactory {
  readonly realm: string;
  /** The `opaque` value every challenge of this server instance carries; clients echo it back. */
  readonly opaque: string;
  /** A challenge header value with a newly generated nonce. */
  create(options?: { stale?: boolean }): string;
}

/**
 * Creates the challenge issuer used by the Digest middleware. `opaque`
 * is a random value fixed for the lifetime of the server process.
 */
export function createDigestChallengeFactory(
  store: DigestNonceStore,
  realm: string,
): DigestChallengeFactory {
  const opaque = randomBytes(16).toString('hex');
  return {
    realm,
    opaque,
    create: (options = {}) =>
      buildDigestChallenge({
        realm,
        nonce: store.generateNonce(),
        opaque,
        stale: options.stale,
      }),
  };
}
