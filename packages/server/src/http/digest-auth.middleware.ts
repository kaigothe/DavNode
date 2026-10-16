import {
  DigestAuthProvider,
  type DataSource,
  type DigestNonceStore,
} from '@davnode/core';
import type { Request, RequestHandler } from 'express';
import { appendChallenge, authorizationScheme } from './auth-chain.js';
import type { DigestChallengeFactory } from './digest-auth-challenge.js';

/** Options for {@link createDigestAuthMiddleware}. */
export interface DigestAuthMiddlewareOptions {
  /**
   * Chained mode (see `auth-chain.ts`): never answer `401` directly,
   * record the challenge and call `next()` so another scheme can try.
   * Default `false`: the middleware answers `401` itself.
   */
  chained?: boolean;
}

/**
 * Parses the parameters of an `Authorization: Digest ...` header
 * (RFC 7616 §3.4): comma-separated `key=value` pairs whose values are
 * either quoted strings (with backslash escapes) or bare tokens. Keys
 * are lower-cased.
 *
 * @returns The parameters, or `null` if `header` is not a Digest header
 * or is malformed.
 */
export function parseDigestAuthorization(
  header: string | undefined,
): Record<string, string> | null {
  if (authorizationScheme(header) !== 'digest') {
    return null;
  }
  const rest = (header ?? '').replace(/^\s*digest\s*/i, '');
  const params: Record<string, string> = {};
  const pair =
    /\s*([A-Za-z0-9_*-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,"]+))\s*(,|$)/y;
  let index = 0;
  while (index < rest.length) {
    pair.lastIndex = index;
    const match = pair.exec(rest);
    if (!match) {
      return null;
    }
    const key = match[1].toLowerCase();
    if (key in params) {
      return null;
    }
    params[key] =
      match[2] !== undefined ? match[2].replace(/\\(.)/g, '$1') : match[3];
    index = pair.lastIndex;
  }
  return params;
}

const REQUIRED_PARAMS = [
  'username',
  'realm',
  'nonce',
  'uri',
  'response',
  'qop',
  'nc',
  'cnonce',
] as const;

/**
 * The HTTP half of Digest Auth (RFC 7616, SHA-256; M10): parses the
 * `Authorization: Digest` header, checks the nonce against the
 * {@link DigestNonceStore} and only then lets the HTTP-independent
 * `DigestAuthProvider` (core) verify the response.
 *
 * Outcomes, all `401` (own challenge or, in chained mode, recorded):
 * - no/foreign/malformed `Authorization`, or an unknown nonce, a replayed
 *   `(nonce, nc)`, a wrong realm/`uri`/`opaque`, an unsupported
 *   `algorithm`/`qop`: a fresh challenge;
 * - an expired nonce: a fresh challenge with `stale=true` — checked
 *   *before* the response, so a client with correct credentials retries
 *   silently;
 * - a wrong `response` with a valid nonce: a fresh challenge **without**
 *   `stale`.
 *
 * The header's `uri` must equal the request's own target, otherwise a
 * captured header could be replayed against another resource.
 *
 * Must run after tenant resolution (usernames are per tenant).
 */
export function createDigestAuthMiddleware(
  dataSource: DataSource,
  nonces: DigestNonceStore,
  challenges: DigestChallengeFactory,
  options: DigestAuthMiddlewareOptions = {},
): RequestHandler {
  const provider = new DigestAuthProvider(dataSource);

  return async (req, res, next): Promise<void> => {
    if (!req.tenant) {
      throw new Error(
        'digest-auth middleware requires the tenant-resolution middleware to run first (req.tenant is not set)',
      );
    }
    if (options.chained && req.principal) {
      next();
      return;
    }

    const deny = (stale = false): void => {
      const challenge = challenges.create({ stale });
      if (options.chained) {
        appendChallenge(res, challenge);
        next();
        return;
      }
      res.set('WWW-Authenticate', challenge);
      res.sendStatus(401);
    };

    const header = req.header('Authorization');
    if (options.chained && authorizationScheme(header) !== 'digest') {
      deny();
      return;
    }

    const params = parseDigestAuthorization(header);
    if (
      !params ||
      REQUIRED_PARAMS.some((name) => !params[name]) ||
      params['realm'] !== challenges.realm ||
      params['qop']?.toLowerCase() !== 'auth' ||
      (params['algorithm'] !== undefined &&
        params['algorithm'].toUpperCase() !== 'SHA-256') ||
      (params['opaque'] !== undefined &&
        params['opaque'] !== challenges.opaque) ||
      params['userhash']?.toLowerCase() === 'true' ||
      'username*' in params ||
      params['uri'] !== requestTarget(req) ||
      !/^[0-9a-fA-F]{8}$/.test(params['nc'])
    ) {
      deny();
      return;
    }

    const nonceState = nonces.validateAndConsumeNonce(
      params['nonce'],
      parseInt(params['nc'], 16),
    );
    if (nonceState === 'stale') {
      deny(true);
      return;
    }
    if (nonceState !== 'valid') {
      deny();
      return;
    }

    const principal = await provider.verify({
      tenantSlug: req.tenant.slug,
      username: params['username'],
      realm: params['realm'],
      nonce: params['nonce'],
      uri: params['uri'],
      method: req.method,
      qop: 'auth',
      nc: params['nc'],
      cnonce: params['cnonce'],
      response: params['response'],
    });
    if (!principal) {
      deny();
      return;
    }

    req.principal = principal;
    next();
  };
}

/** The request-target a Digest `uri` parameter must equal: path plus query string, as the client sent it. */
function requestTarget(req: Request): string {
  return req.originalUrl;
}
