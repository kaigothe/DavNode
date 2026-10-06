import {
  buildErrorResponse,
  DAV_NAMESPACE,
  type QuotaExceededError,
} from '@davnode/core';
import type { Response } from 'express';

/**
 * Sends the `507 Insufficient Storage` a {@link QuotaExceededError}
 * answers with (RFC 4918 §11.5; "SHOULD be used when a client request
 * fails because it would exceed their quota", RFC 4331 §6) — shared by
 * every write path across the WebDAV/CardDAV/CalDAV domains (M8), the
 * same way `sendCalDavPrecondition` shares one `<D:error>` shape across
 * CalDAV's own routes.
 *
 * The body carries RFC 4331's own `DAV:quota-not-exceeded` precondition
 * element, plus a non-standard nested `quota-level` hint naming which
 * level (`user`/`tenant`) was exceeded — `error.level`, never a limit or
 * usage number. The level alone is safe to reveal even when the request
 * acted on *someone else's* quota (e.g. overwriting a file owned by
 * another principal attributes the delta to that owner, per
 * `milestones/M8-quota/02-webdav-quota-integration/01-put-delete-retrofit.md`);
 * the actual limit or usage of a tenant/user other than the requester's
 * own never appears in the response.
 */
export function sendQuotaExceededResponse(
  res: Response,
  error: QuotaExceededError,
): void {
  res
    .status(507)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .send(
      buildErrorResponse([
        {
          namespace: DAV_NAMESPACE,
          name: 'quota-not-exceeded',
          children: [
            {
              namespace: DAV_NAMESPACE,
              name: 'quota-level',
              text: error.level,
            },
          ],
        },
      ]),
    );
}
