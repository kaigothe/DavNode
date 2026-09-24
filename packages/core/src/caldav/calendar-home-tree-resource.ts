import type { CalendarCollection } from '../entities/calendar-collection.entity.js';

/**
 * The synthetic (non-DB-backed) `/dav/{tenant}/calendars/{userId}/` home
 * collection itself (RFC 4791 §6.2.1) — holds the owning user
 * principal's id, since PROPFIND needs to resolve and report properties
 * for this URL without any DB row of its own. Same technique as
 * `AddressbookHomeCollection` (M5).
 */
export class CalendarHomeCollection {
  constructor(public readonly ownerPrincipalId: string) {}
}

/**
 * Everything a PROPFIND request against
 * `/dav/{tenant}/calendars/{userId}{/*splat}` can resolve to
 * (`calendar-home.route.ts`): the virtual home collection itself, or one
 * of its owner's actual `CalendarCollection` rows.
 */
export type CalendarHomeTreeResource =
  CalendarHomeCollection | CalendarCollection;
