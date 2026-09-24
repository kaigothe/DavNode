import type { CalendarCollection } from '../entities/calendar-collection.entity.js';
import type { CalendarObject } from '../entities/calendar-object.entity.js';

/**
 * Everything the calendar domain's ACL and lock evaluation
 * (`collectCalendarAces`/`hasCalendarPrivilege`,
 * `getEffectiveCalendarLocks`) can check against — the CalDAV analog of
 * `AddressbookAclResource`. Deliberately excludes `CalendarHomeCollection`:
 * the virtual home has no ACE table of its own to evaluate (see there), so
 * its routes keep the ownership check.
 */
export type CalendarAclResource = CalendarCollection | CalendarObject;
