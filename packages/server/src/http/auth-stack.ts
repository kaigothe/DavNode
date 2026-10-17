import {
  OAuth2AuthProvider,
  type DataSource,
  type DigestNonceStore,
} from '@davnode/core';
import type { RequestHandler } from 'express';
import type { AuthConfig } from '../auth-config.js';
import type { AuthObserver } from './auth-observer.js';
import { createAuthTerminator } from './auth-chain.js';
import { createBasicAuthMiddleware } from './basic-auth.middleware.js';
import { createDigestChallengeFactory } from './digest-auth-challenge.js';
import { createDigestAuthMiddleware } from './digest-auth.middleware.js';
import { createOAuth2BearerMiddleware } from './oauth2-bearer.middleware.js';

/**
 * Builds the authentication middleware chain for the configured schemes
 * (M10). The result is mounted after tenant resolution on both
 * `/dav/{tenantSlug}` and `/admin/{tenantSlug}`.
 *
 * With only `basic` active (the default) this is exactly the M2 Basic
 * middleware, unchanged. With several schemes each runs in chained mode,
 * in the configured order, followed by a terminator that answers an
 * unauthenticated request `401` with one `WWW-Authenticate` header line
 * per scheme. Every scheme is tried on every request, so a client that
 * only speaks Digest or Bearer works as well as one speaking Basic.
 *
 * @param nonces - The Digest nonce store; required when `digest` is active.
 */
export function createAuthMiddlewares(
  dataSource: DataSource,
  config: AuthConfig,
  nonces: DigestNonceStore,
  observer?: AuthObserver,
): RequestHandler[] {
  const [only] = config.providers;
  if (config.providers.length === 1 && only === 'basic') {
    return [
      createBasicAuthMiddleware(dataSource, { realm: config.realm, observer }),
    ];
  }

  const chain: RequestHandler[] = config.providers.map((name) => {
    switch (name) {
      case 'basic':
        return createBasicAuthMiddleware(dataSource, {
          realm: config.realm,
          chained: true,
          observer,
        });
      case 'digest':
        return createDigestAuthMiddleware(
          dataSource,
          nonces,
          createDigestChallengeFactory(nonces, config.realm),
          { chained: true, observer },
        );
      case 'oauth2':
        return createOAuth2BearerMiddleware(
          new OAuth2AuthProvider(dataSource, config.oauth2Issuers),
          { realm: config.realm, chained: true, observer },
        );
    }
  });
  chain.push(createAuthTerminator());
  return chain;
}
