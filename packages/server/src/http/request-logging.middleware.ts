import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { requestContext, type Logger } from '../logging/logger.js';

/**
 * Path segments that are secrets and must not be logged: the ICS feed token
 * (`/calendars/{user}/{calendar}/feed/{token}.ics`) is the only credential
 * of a feed URL.
 */
export function redactPath(pathname: string): string {
  return pathname.replace(/(\/feed\/)[^/]+$/, '$1[redacted]');
}

/**
 * Gives every request an id (a fresh UUID — a client-supplied one is not
 * trusted), exposes it as `X-Request-Id`, makes it available to all log
 * lines written while the request is handled (`requestContext`), and logs
 * one line when the response has been sent: method, path, status, duration
 * and — when known by then — tenant and principal. The query string is not
 * logged, and neither are headers or bodies, so credentials never get here.
 * Probe traffic on `/healthz` is logged at `debug` only.
 */
export function createRequestLoggingMiddleware(logger: Logger): RequestHandler {
  return (req, res, next): void => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    // Taken now: inside a mounted middleware `req.path` is relative to the
    // mount point, so by the time a 401 is sent it would read "/principals/".
    const path = redactPath(req.originalUrl.split('?')[0] ?? req.path);
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const entry = {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        tenantSlug: req.tenant?.slug,
        principalId: req.principal?.id,
      };
      requestContext.run({ requestId }, () => {
        const level = path === '/healthz' ? 'debug' : 'info';
        logger[level](entry, 'request completed');
      });
    });

    requestContext.run({ requestId }, next);
  };
}
