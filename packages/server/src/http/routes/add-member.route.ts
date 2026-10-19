import { randomUUID } from 'node:crypto';
import { RESERVED_CALENDAR_NAMES } from '@davnode/core';
import type { Express, NextFunction, Request, Response } from 'express';

/**
 * Registers RFC 5995 `POST` to a calendar or addressbook collection: the
 * request body is stored as a new member whose name the server picks
 * (`{uuid}.ics` / `{uuid}.vcf`), answered `201` with its `Location`.
 *
 * Implemented as a rewrite into the ordinary `PUT` of that member with
 * `If-None-Match: *`, so every rule of the real write path applies
 * unchanged — parsing and its preconditions, ACL, quota, locks,
 * scheduling, change tracking. Must therefore be registered before the
 * `PUT` routes. The calendar `inbox`/`outbox` are not collections of
 * members and are left to their own routes.
 */
export function registerAddMemberRoute(app: Express): void {
  const rewrite =
    (extension: 'ics' | 'vcf', reserved: readonly string[]) =>
    (req: Request, res: Response, next: NextFunction): void => {
      const collection = req.params['collection'];
      if (
        typeof collection !== 'string' ||
        reserved.includes(collection.toLowerCase())
      ) {
        next('route');
        return;
      }
      const [path = '', query = ''] = req.url.split('?');
      const location = `${path.replace(/\/+$/, '')}/${randomUUID()}.${extension}`;
      req.method = 'PUT';
      req.url = query === '' ? location : `${location}?${query}`;
      req.headers['if-none-match'] = '*';
      // Only a created member has a Location; failures must not carry one.
      const writeHead = res.writeHead.bind(res) as (
        ...args: unknown[]
      ) => Response;
      res.writeHead = ((status: number, ...rest: unknown[]) => {
        if (status === 201) {
          res.setHeader('Location', location);
        }
        return writeHead(status, ...rest);
      }) as typeof res.writeHead;
      next();
    };

  app.post(
    '/dav/:tenantSlug/calendars/:userId/:collection',
    rewrite('ics', RESERVED_CALENDAR_NAMES),
  );
  app.post(
    '/dav/:tenantSlug/addressbooks/:userId/:collection',
    rewrite('vcf', []),
  );
}
