import type { RequestHandler, Response } from 'express';

/**
 * Support for running several authentication schemes side by side
 * (M10, milestones/M10-extended-auth/06-provider-management). A scheme's
 * middleware in *chained* mode never answers `401` itself: when it does
 * not authenticate the request it records its own `WWW-Authenticate`
 * challenge with {@link appendChallenge} and passes the request on, so
 * the next scheme can try; the terminator ({@link createAuthTerminator}),
 * mounted after the last scheme, then sends the `401` carrying every
 * recorded challenge as its own header line (never comma-joined, since
 * Digest challenges contain commas themselves).
 */
export function appendChallenge(res: Response, challenge: string): void {
  const challenges = (res.locals['authChallenges'] ??= []) as string[];
  challenges.push(challenge);
}

/**
 * Terminates a chain of chained-mode scheme middlewares: lets an
 * authenticated request (`req.principal` set) through, answers anything
 * else `401` with all challenges the schemes recorded.
 */
export function createAuthTerminator(): RequestHandler {
  return (req, res, next): void => {
    if (req.principal) {
      next();
      return;
    }
    const challenges = (res.locals['authChallenges'] ?? []) as string[];
    for (const challenge of challenges) {
      res.append('WWW-Authenticate', challenge);
    }
    res.sendStatus(401);
  };
}

/** The scheme name of an `Authorization` header (lower-cased), or `null` if absent/empty. */
export function authorizationScheme(header: string | undefined): string | null {
  const match = /^\s*([A-Za-z][A-Za-z0-9._~+-]*)(?:\s|$)/.exec(header ?? '');
  return match?.[1]?.toLowerCase() ?? null;
}
