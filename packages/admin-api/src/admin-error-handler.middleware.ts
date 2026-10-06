import {
  CycleDetectedError,
  DuplicateEntryError,
  NotFoundError,
} from '@davnode/core';
import type { ErrorRequestHandler } from 'express';
import { sendAdminError } from './admin-error-response.js';

/**
 * Maps a known, "expected" core error type to its HTTP status, a
 * stable `code`, and a client-safe message. Returns `null` for
 * anything else, which {@link adminErrorHandler} then falls back to a
 * generic `500` for. The same three error types `server`'s own
 * `error-handler.middleware.ts` recognizes (`core`'s existing
 * `TenantService`/`UserService`/`GroupService`/`GroupMembershipService`
 * already throw them — the later Große Aufgaben that add real Admin API
 * routes call those same services, not new ones).
 */
function mapKnownError(
  error: unknown,
): { status: number; code: string; message: string } | null {
  if (error instanceof NotFoundError) {
    return { status: 404, code: 'not_found', message: error.message };
  }
  if (error instanceof DuplicateEntryError) {
    return { status: 409, code: 'duplicate_entry', message: error.message };
  }
  if (error instanceof CycleDetectedError) {
    return { status: 409, code: 'cycle_detected', message: error.message };
  }
  return null;
}

/**
 * Central error-handling middleware for the `/admin` router: turns an
 * error thrown by, or `next(error)`-forwarded from, any earlier
 * middleware or route into the shared `AdminErrorBody` JSON shape
 * (`admin-error-response.ts`). Express 5 auto-forwards a rejected
 * promise from an async
 * handler here, so no manual try/catch wrapper is needed anywhere
 * upstream.
 *
 * A genuinely unexpected failure (anything `mapKnownError` doesn't
 * recognize) answers `500` with a fixed, generic body — the error
 * itself (message and stack) is never sent to the client, only logged
 * via `console.error`, so operators can debug it without leaking
 * internal detail to callers.
 *
 * Must be the last `router.use(...)` call on the Admin API router
 * (`router.ts`): Express only invokes a 4-argument middleware as an
 * error handler, and only for errors from middleware/routes mounted
 * before it.
 */
export const adminErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
): void => {
  console.error(error);

  const known = mapKnownError(error);
  if (known) {
    sendAdminError(res, known.status, known.code, known.message);
    return;
  }

  sendAdminError(res, 500, 'internal_error', 'An unexpected error occurred.');
};
