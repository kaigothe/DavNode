import type { Response } from 'express';

/**
 * The JSON body every Admin API error response shares
 * (`milestones/M9-admin-api/02-admin-api-scaffold/01-router-setup-and-mounting.md`):
 * a `code` a client can branch on programmatically, and a human-
 * readable `message` — never a stack trace or other internal detail.
 */
export interface AdminErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Sends an {@link AdminErrorBody}-shaped error response. The one place
 * that shape is actually constructed, so every Admin API error —
 * `adminErrorHandler`'s own fallback for an unexpected failure, or a
 * route/middleware's own direct, expected rejection (e.g. `requireAdminRole`'s
 * `403`) — looks identical regardless of where it came from.
 */
export function sendAdminError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  res
    .status(status)
    .json({ error: { code, message } } satisfies AdminErrorBody);
}
