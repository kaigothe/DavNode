import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { CalendarCollection } from '../entities/calendar-collection.entity.js';

/** Bytes of randomness in a generated feed token — 256 bits, base64url-encoded. */
const FEED_TOKEN_BYTES = 32;

/**
 * Generates a fresh, cryptographically random ICS feed token for
 * `calendarId` and stores it, overwriting (and so revoking) any previous
 * one — the feed's only "regenerate" operation (planning/01-decisions.md,
 * Runde 14/21). The token is a 256-bit value, base64url-encoded so it
 * drops cleanly into the `.../feed/{token}.ics` URL path segment with no
 * further escaping.
 *
 * A collision with another calendar's token — the unique index's
 * job to catch — is astronomically unlikely at 256 bits of randomness
 * and isn't retried, the same trust already placed in this server's
 * SHA-256 ETags and UUIDs.
 */
export async function generateFeedToken(
  dataSource: DataSource,
  calendarId: string,
): Promise<string> {
  const token = randomBytes(FEED_TOKEN_BYTES).toString('base64url');
  await dataSource
    .getRepository(CalendarCollection)
    .update({ id: calendarId }, { icsFeedToken: token });
  return token;
}

/**
 * Disables `calendarId`'s ICS feed by clearing its token — every
 * previously issued feed URL answers `404` immediately afterwards (see
 * `ics-feed.route.ts`).
 */
export async function revokeFeedToken(
  dataSource: DataSource,
  calendarId: string,
): Promise<void> {
  await dataSource
    .getRepository(CalendarCollection)
    .update({ id: calendarId }, { icsFeedToken: null });
}
