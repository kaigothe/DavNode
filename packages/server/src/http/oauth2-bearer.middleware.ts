import type { AuthProvider } from '@davnode/core';
import type { RequestHandler } from 'express';
import { appendChallenge, authorizationScheme } from './auth-chain.js';

/** Options for {@link createOAuth2BearerMiddleware}. */
export interface OAuth2BearerMiddlewareOptions {
  /** Sent in the `WWW-Authenticate` challenge. Defaults to `'davnode'`. */
  realm?: string;
  /**
   * Chained mode (see `auth-chain.ts`): never answer `401` directly,
   * record the challenge and call `next()` so another scheme can try.
   * Default `false`: the middleware answers `401` itself.
   */
  chained?: boolean;
}

/**
 * The HTTP half of OAuth2 bearer authentication (RFC 6750; M10): reads
 * `Authorization: Bearer <token>` and lets the core `oauth2` provider
 * validate it.
 *
 * - No `Authorization` header, or one for another scheme (`Basic`,
 *   `Digest`): this middleware does not take part — in standalone mode it
 *   answers `401` with `WWW-Authenticate: Bearer realm="..."` and **no**
 *   `error` parameter (RFC 6750 §3.1: `error` is only for a request that
 *   actually carried a token); in chained mode it records that same
 *   challenge and passes on.
 * - A bearer token that fails validation (expired, forged, unlinked ...):
 *   `401` with `error="invalid_token"`, without saying why.
 * - A valid token sets `req.principal`.
 *
 * Must run after tenant resolution: a token only authenticates users of
 * the tenant in the URL.
 *
 * @param provider - The `oauth2` provider; called with `{ token, tenantSlug }`.
 */
export function createOAuth2BearerMiddleware(
  provider: AuthProvider,
  options: OAuth2BearerMiddlewareOptions = {},
): RequestHandler {
  const realm = options.realm ?? 'davnode';
  const plainChallenge = `Bearer realm="${realm}"`;
  const invalidTokenChallenge = `Bearer realm="${realm}", error="invalid_token"`;

  return async (req, res, next): Promise<void> => {
    if (!req.tenant) {
      throw new Error(
        'oauth2-bearer middleware requires the tenant-resolution middleware to run first (req.tenant is not set)',
      );
    }
    if (options.chained && req.principal) {
      next();
      return;
    }

    const deny = (challenge: string): void => {
      if (options.chained) {
        appendChallenge(res, challenge);
        next();
        return;
      }
      res.set('WWW-Authenticate', challenge);
      res.sendStatus(401);
    };

    const header = req.header('Authorization');
    if (authorizationScheme(header) !== 'bearer') {
      deny(plainChallenge);
      return;
    }

    const token = /^\s*bearer\s+(\S+)\s*$/i.exec(header ?? '')?.[1];
    const principal = token
      ? await provider.verify({ token, tenantSlug: req.tenant.slug })
      : null;
    if (!principal) {
      deny(invalidTokenChallenge);
      return;
    }

    req.principal = principal;
    next();
  };
}
