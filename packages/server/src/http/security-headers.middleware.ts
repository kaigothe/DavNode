import type { RequestHandler } from 'express';

/** One year; the usual HSTS lifetime. */
const HSTS_MAX_AGE_SECONDS = 31_536_000;

/**
 * Adds the standard hardening headers to every response (M12):
 * `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and
 * `Referrer-Policy: no-referrer`.
 *
 * `Strict-Transport-Security` is sent only with `behindTlsProxy`: over
 * plain HTTP the header is ignored by browsers at best and misleading at
 * worst, so it is tied to the deployment that really serves HTTPS.
 *
 * **CORS is deliberately off**: no `Access-Control-*` header is ever set.
 * WebDAV, CalDAV and CardDAV clients are not scripts running in a browser
 * page and need none; if a browser-based admin interface ever appears, CORS
 * for it has to be an explicit decision, not an accident of defaults.
 */
export function createSecurityHeadersMiddleware(options: {
  behindTlsProxy: boolean;
}): RequestHandler {
  return (_req, res, next): void => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    if (options.behindTlsProxy) {
      res.set('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE_SECONDS}`);
    }
    next();
  };
}
