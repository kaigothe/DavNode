import type { Request } from 'express';

/** The authentication schemes whose outcome is observed. */
export type AuthScheme = 'basic' | 'digest' | 'oauth2';

/**
 * Hears about every credential check the three authentication middlewares
 * make (M12): the metrics count failures per scheme, the rate limiter
 * counts them per client address. Only a check that actually ran is
 * reported — a request without an `Authorization` header is the normal
 * first step of Digest and Basic and is neither a failure nor a success,
 * and neither is a Digest retry with an expired nonce.
 */
export interface AuthObserver {
  /** Credentials of `scheme` were presented and rejected. */
  failure(req: Request, scheme: AuthScheme): void;
  /** Credentials were presented and accepted. */
  success(req: Request): void;
}

/** An observer forwarding every event to all of `observers`. */
export function combineObservers(
  ...observers: (AuthObserver | undefined)[]
): AuthObserver {
  const active = observers.filter(
    (observer): observer is AuthObserver => observer !== undefined,
  );
  return {
    failure: (req, scheme) => active.forEach((o) => o.failure(req, scheme)),
    success: (req) => active.forEach((o) => o.success(req)),
  };
}
