import {
  buildErrorResponse,
  CALDAV_NAMESPACE,
  type ErrorCondition,
} from '@davnode/core';
import type { Response } from 'express';

/**
 * Sends the `403 Forbidden` a violated CalDAV precondition (RFC 4791
 * §5.3.1/§5.3.2.1) is answered with: a `<D:error>` body whose single
 * child names the `precondition` in the CalDAV namespace (RFC 4918 §16).
 * A precondition that carries content — `no-uid-conflict` names the
 * conflicting resource in a `DAV:href` — passes it as `children`; it
 * usually is a `409` instead, so `status` can be overridden.
 */
export function sendCalDavPrecondition(
  res: Response,
  precondition: string,
  options: { children?: readonly ErrorCondition[]; status?: number } = {},
): void {
  res
    .status(options.status ?? 403)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .send(
      buildErrorResponse([
        {
          namespace: CALDAV_NAMESPACE,
          name: precondition,
          children: options.children,
        },
      ]),
    );
}
