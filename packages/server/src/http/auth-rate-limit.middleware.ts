import type { Request, RequestHandler } from 'express';
import type { AuthRateLimiter } from '../security/auth-rate-limiter.js';
import type { AuthObserver } from './auth-observer.js';

/** The client address the limiter counts by (`req.ip`, which honours `trust proxy`). */
export function clientAddress(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * Refuses requests from an address that has used up its failed logins
 * (`429 Too Many Requests` with `Retry-After`), **before** any
 * authentication middleware runs — which also saves the cost of verifying
 * yet another guess against an argon2id hash. Mounted ahead of the Basic,
 * Digest and OAuth2 middlewares alike.
 */
export function createAuthRateLimitMiddleware(
  limiter: AuthRateLimiter,
): RequestHandler {
  return (req, res, next): void => {
    const retryAfter = limiter.retryAfterSeconds(clientAddress(req));
    if (retryAfter > 0) {
      res
        .status(429)
        .set('Retry-After', String(retryAfter))
        .type('text/plain')
        .send('Too many failed login attempts. Try again later.\n');
      return;
    }
    next();
  };
}

/** Feeds the limiter from the auth middlewares: failures count, a success clears. */
export function rateLimitObserver(limiter: AuthRateLimiter): AuthObserver {
  return {
    failure: (req) => limiter.recordFailure(clientAddress(req)),
    success: (req) => limiter.recordSuccess(clientAddress(req)),
  };
}
