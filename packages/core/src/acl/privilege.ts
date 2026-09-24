/**
 * The RFC 3744 §5.3 privilege vocabulary (planning/05-data-model.md,
 * section "ACL-Privilege-Katalog"), shared verbatim across all six ACE
 * tables (`collection_aces`, `file_aces`, and the calendar/addressbook
 * equivalents added in M5/M6) — a plain value vocabulary, not a foreign
 * key, so reusing it across domains doesn't conflict with the
 * domain-separation principle (planning/01-decisions.md, Runde 11).
 *
 * `write` and `all` are aggregated privileges, expanded to their
 * constituents at evaluation time rather than in the database — see
 * `expandPrivilege` in `privilege-aggregation.ts`.
 */
export type Privilege =
  | 'read'
  | 'write'
  | 'write-properties'
  | 'write-content'
  | 'bind'
  | 'unbind'
  | 'unlock'
  | 'read-acl'
  | 'write-acl'
  | 'read-current-user-privilege-set'
  | 'all';

/** All valid {@link Privilege} values. */
export const ALL_PRIVILEGES: readonly Privilege[] = [
  'read',
  'write',
  'write-properties',
  'write-content',
  'bind',
  'unbind',
  'unlock',
  'read-acl',
  'write-acl',
  'read-current-user-privilege-set',
  'all',
];

/**
 * A privilege in the calendar domain: the shared {@link Privilege}
 * vocabulary plus `CALDAV:read-free-busy` (RFC 4791 §6.1.1), which lets
 * a principal ask for free/busy time without seeing event details.
 *
 * Deliberately *not* part of {@link Privilege}/{@link ALL_PRIVILEGES}: it
 * only means something on calendars, and the shared catalog is baked
 * into the `simple-enum` column of every other domain's ACE table, so
 * extending it would need an enum migration for those tables and would
 * make WebDAV/CardDAV resources list and accept a privilege they can't
 * use. Only `calendar_aces`/`calendar_object_aces` store it
 * ({@link CALENDAR_PRIVILEGES}).
 *
 * RFC 4791 §6.1.1 fixes its relationship to the rest: it "MUST be
 * aggregated in the DAV:read privilege" (so `read` also grants
 * `read-free-busy`, and so does `all`), yet "MUST be allowed to be
 * granted without the DAV:read privilege being granted" (holding only
 * `read-free-busy` grants no GET/PROPFIND). This type only *stores* the
 * value; that aggregation is the calendar ACL evaluation's job
 * (`expandCalendarPrivilege`/`calendarPrivilegeSatisfies` in
 * `privilege-aggregation.ts`, used by `hasCalendarPrivilege`) —
 * `expandPrivilege` and `privilegeSatisfies` only know the shared catalog.
 */
export type CalendarPrivilege = Privilege | 'read-free-busy';

/** All valid {@link CalendarPrivilege} values: {@link ALL_PRIVILEGES} plus `read-free-busy`. */
export const CALENDAR_PRIVILEGES: readonly CalendarPrivilege[] = [
  ...ALL_PRIVILEGES,
  'read-free-busy',
];
