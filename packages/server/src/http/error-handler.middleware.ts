import { DuplicateEntryError, NotFoundError } from '@davnode/core';
import type { ErrorRequestHandler } from 'express';

/**
 * Maps a known, "expected" error type to its HTTP status code and a
 * client-safe message. Returns `null` for anything else, which
 * {@link errorHandlerMiddleware} then falls back to a generic `500`
 * for — see there for why that fallback never echoes `error.message`.
 */
function mapKnownError(
  error: unknown,
): { status: number; message: string } | null {
  if (error instanceof NotFoundError) {
    return { status: 404, message: error.message };
  }
  if (error instanceof DuplicateEntryError) {
    return { status: 409, message: error.message };
  }
  return null;
}

/**
 * Central error-handling middleware: turns an error thrown by, or
 * `next(error)`-forwarded from, any earlier middleware or route into
 * an HTTP response. Express 5 auto-forwards a rejected promise from an
 * async handler to this middleware, so no manual try/catch wrapper is
 * needed anywhere upstream.
 *
 * Known error types (see {@link mapKnownError}) map to their specific
 * status code with a client-safe message. Everything else — a
 * genuinely unexpected failure, e.g. a database outage — responds
 * `500` with a generic, fixed body. The error itself (message and
 * stack) is never sent to the client; it's only written to the server
 * log via `console.error`, so operators can debug it without leaking
 * internal detail to callers.
 *
 * Must be the last `app.use(...)` call: Express only invokes a
 * 4-argument middleware as an error handler, and only for errors from
 * middleware/routes mounted before it.
 */
export const errorHandlerMiddleware: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
): void => {
  console.error(error);

  const known = mapKnownError(error);
  if (known) {
    res.status(known.status).type('text/plain').send(known.message);
    return;
  }

  res.status(500).type('text/plain').send('Internal Server Error');
};
