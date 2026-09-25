import {
  buildCalendarFeed,
  CalendarCollection,
  loadCalendarFeedIcsData,
  type DataSource,
} from '@davnode/core';
import type { Express, Request, Response } from 'express';
import { ifNoneMatchMatches } from './conditional-request.util.js';

/** The token segment of the feed URL, with its `.ics` suffix (if present) stripped. */
function tokenFromParam(tokenFile: string): string {
  return tokenFile.replace(/\.ics$/i, '');
}

/** `date`, truncated to whole seconds — `Last-Modified`/`If-Modified-Since` are HTTP-dates, which have no sub-second precision. */
function toHttpSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** Sets the caching headers every response (`200` or `304`) shares. */
function setCachingHeaders(
  res: Response,
  etag: string,
  lastModified: Date,
): void {
  res.set('ETag', etag).set('Last-Modified', lastModified.toUTCString());
}

/**
 * Registers the read-only ICS feed:
 * `GET /dav/{tenantSlug}/calendars/{userId}/{calendarName}/feed/{token}.ics`
 * (planning/01-decisions.md, Runde 14/21) — a calendar's objects,
 * aggregated into one `VCALENDAR` document, for calendar-subscription
 * clients (Outlook, Google Calendar) that poll a URL rather than
 * speaking CalDAV.
 *
 * **Deliberately not Basic-Auth-protected**: such clients handle
 * interactive auth prompts poorly, so the token itself — a 256-bit
 * random value (`feed-token.service.ts`), the calendar's `icsFeedToken`
 * — is the only authentication. It alone identifies the calendar, so
 * the `{tenantSlug}`/`{userId}`/`{calendarName}` path segments before it
 * are for a readable URL only and are never checked against the
 * resolved calendar. Must be registered before `app.ts` mounts the
 * tenant-resolution/Basic-Auth middleware, so a request never reaches
 * either.
 *
 * A missing, never-generated (`null`) or revoked/regenerated-away token
 * answers `404` — never `401`, which would itself reveal that a
 * calendar exists at that URL (RFC 4791 §7.10 makes the same choice for
 * `free-busy-query` without `read-free-busy`).
 *
 * **Caching**: the `ETag` is the calendar's `syncSeq` (bumped by every
 * child `CalendarObject` create/update/delete, `calendar-change.service.ts`)
 * and `Last-Modified` is the calendar row's own `updatedAt` — which the
 * same bump also advances, since `CalendarChangeService.recordChange`
 * updates that row (TypeORM's `@UpdateDateColumn` fires on any `UPDATE`
 * through the query builder, including an `increment()`). Both come from
 * one lightweight `CalendarCollection` row, so a poll that finds nothing
 * changed (the common case) never has to load or re-aggregate a single
 * `CalendarObject` — the whole point of caching a feed clients poll
 * periodically.
 */
export function registerIcsFeedRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.get(
    '/dav/:tenantSlug/calendars/:userId/:calendarName/feed/:tokenFile',
    async (req: Request, res: Response): Promise<void> => {
      const token = tokenFromParam(
        (req.params as Record<string, unknown>).tokenFile as string,
      );

      const calendar = await dataSource
        .getRepository(CalendarCollection)
        .findOneBy({ icsFeedToken: token });
      if (!calendar) {
        res.sendStatus(404);
        return;
      }

      const etag = String(calendar.syncSeq);
      const lastModified = calendar.updatedAt;

      const ifNoneMatch = req.header('If-None-Match');
      if (ifNoneMatch !== undefined) {
        if (ifNoneMatchMatches(ifNoneMatch, etag)) {
          setCachingHeaders(res, etag, lastModified);
          res.sendStatus(304);
          return;
        }
      } else {
        const ifModifiedSince = req.header('If-Modified-Since');
        if (ifModifiedSince !== undefined) {
          const since = new Date(ifModifiedSince);
          if (
            !Number.isNaN(since.getTime()) &&
            toHttpSeconds(lastModified) <= toHttpSeconds(since)
          ) {
            setCachingHeaders(res, etag, lastModified);
            res.sendStatus(304);
            return;
          }
        }
      }

      const icsDataList = await loadCalendarFeedIcsData(
        dataSource.manager,
        calendar.id,
      );
      const body = buildCalendarFeed(icsDataList);

      res.status(200).set('Content-Type', 'text/calendar; charset=utf-8');
      setCachingHeaders(res, etag, lastModified);
      res.send(body);
    },
  );
}
