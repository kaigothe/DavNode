import {
  generateFeedToken,
  hasCalendarPrivilege,
  type CalendarAclResource,
  type DataSource,
} from '@davnode/core';
import type { Express, Request } from 'express';
import { createAclAuthorizationMiddleware } from '../../acl-authorization.middleware.js';
import {
  calendarOwnerIdParam,
  requirePrincipal,
  requireTenant,
} from '../dav-request.util.js';
import { resolveCalendar } from './calendar-object-resolver.js';

/** `req.params.calendarName`, from this route's own literal path. */
function calendarNameParam(req: Request): string {
  return (req.params as Record<string, unknown>).calendarName as string;
}

/**
 * Registers `POST /dav/{tenantSlug}/calendars/{userId}/{calendarName}/feed-token`
 * (planning/01-decisions.md, Runde 14/21): generates (or regenerates,
 * silently revoking the previous one) the calendar's ICS feed token.
 *
 * Unlike the feed itself (`ics-feed.route.ts`), this endpoint is a
 * regular Basic-Auth-protected DAV-adjacent route — it sits behind the
 * normal tenant-resolution/auth middleware in `app.ts` — and requires
 * `write-acl` on the calendar rather than `read`: sharing (or revoking)
 * a feed is an access-control decision, the same threshold as changing
 * the calendar's ACL itself.
 *
 * Responds `200` with `{ "token": string }` — the caller already knows
 * the tenant/user/calendar segments of the feed URL from the request it
 * just made, so only the new token itself needs to come back.
 */
export function registerFeedTokenRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.post(
    '/dav/:tenantSlug/calendars/:userId/:calendarName/feed-token',
    createAclAuthorizationMiddleware<CalendarAclResource>(
      dataSource,
      async (req) => {
        const tenant = requireTenant(req);
        const userId = calendarOwnerIdParam(req);
        const calendarName = calendarNameParam(req);
        const calendar = await resolveCalendar(
          dataSource,
          tenant.id,
          userId,
          calendarName,
        );
        if (!calendar) {
          return null;
        }
        return { resource: calendar, privilege: 'write-acl' };
      },
      hasCalendarPrivilege,
    ),
    async (req: Request, res): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const userId = calendarOwnerIdParam(req);
      const calendarName = calendarNameParam(req);

      const calendar = await resolveCalendar(
        dataSource,
        tenant.id,
        userId,
        calendarName,
      );
      if (!calendar) {
        res.sendStatus(userId === principal.id ? 404 : 403);
        return;
      }

      const token = await generateFeedToken(dataSource, calendar.id);
      res.status(200).json({ token });
    },
  );
}
