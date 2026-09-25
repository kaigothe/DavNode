import {
  ALL_PRIVILEGES,
  CALENDAR_PRIVILEGES,
  type CalendarPrivilege,
  type Privilege,
} from './privilege.js';

/**
 * Resolves an aggregated {@link Privilege} into its constituents, per
 * planning/05-data-model.md ("ACL-Privilege-Katalog"):
 * - `all` expands to the entire eleven-value vocabulary (including
 *   itself — RFC 3744 §5.3 defines `DAV:all` as covering every
 *   privilege, and the vocabulary has exactly eleven members total).
 * - `write` expands to `write-properties` and `write-content`.
 * - Every other (elementary) privilege expands to only itself.
 *
 * Resolved at evaluation time rather than stored expanded in the
 * database — see the ACE entities (`CollectionAce`/`FileAce`).
 *
 * `schedule-deliver`/`schedule-send` (RFC 6638 §6.2, planning/
 * 05-data-model.md Runde 22) split the same way: `schedule-deliver`
 * expands to `schedule-deliver-invite` and `schedule-deliver-reply`;
 * `schedule-send` to `schedule-send-invite`, `schedule-send-reply` and
 * `schedule-send-freebusy`. Neither is reachable from `all`, which only
 * ever expands to {@link ALL_PRIVILEGES} — the scheduling vocabulary
 * stays independent of the shared one, like `CALDAV:read-free-busy`
 * already does for the calendar domain (`expandCalendarPrivilege`).
 *
 * @param privilege - The privilege to expand.
 * @returns The privilege's constituent, elementary or aggregated,
 * privileges — never empty.
 */
export function expandPrivilege(privilege: Privilege): Privilege[] {
  switch (privilege) {
    case 'all':
      return [...ALL_PRIVILEGES];
    case 'write':
      return ['write-properties', 'write-content'];
    case 'schedule-deliver':
      return ['schedule-deliver-invite', 'schedule-deliver-reply'];
    case 'schedule-send':
      return [
        'schedule-send-invite',
        'schedule-send-reply',
        'schedule-send-freebusy',
      ];
    default:
      return [privilege];
  }
}

/**
 * Checks whether a granted (possibly aggregated) privilege covers a
 * requested (possibly elementary) privilege — e.g.
 * `privilegeSatisfies('all', 'read')` is `true` because `all` expands to
 * include `read`.
 *
 * @param granted - The privilege an ACE grants or denies.
 * @param requested - The privilege being checked for.
 * @returns Whether `granted` covers `requested`.
 */
export function privilegeSatisfies(
  granted: Privilege,
  requested: Privilege,
): boolean {
  return expandPrivilege(granted).includes(requested);
}

/**
 * {@link expandPrivilege} for the calendar domain, whose vocabulary adds
 * `CALDAV:read-free-busy` (RFC 4791 §6.1.1): "The CALDAV:read-free-busy
 * privilege MUST be aggregated in the DAV:read privilege", so `read`
 * expands to itself and `read-free-busy`, and `all` — which covers every
 * privilege — to the whole calendar vocabulary. `read-free-busy` on its
 * own expands to only itself: it "MUST be allowed to be granted without
 * the DAV:read privilege being granted" (granting it lets a principal ask
 * for free/busy time, not `GET` or `PROPFIND` anything). Everything else
 * is as in the shared catalog.
 *
 * @param privilege - The privilege to expand.
 * @returns The privilege's constituents — never empty.
 */
export function expandCalendarPrivilege(
  privilege: CalendarPrivilege,
): CalendarPrivilege[] {
  switch (privilege) {
    case 'all':
      return [...CALENDAR_PRIVILEGES];
    case 'read':
      return ['read', 'read-free-busy'];
    case 'read-free-busy':
      return ['read-free-busy'];
    default:
      return expandPrivilege(privilege);
  }
}

/**
 * {@link privilegeSatisfies} for the calendar domain: whether a granted
 * (possibly aggregated) {@link CalendarPrivilege} covers a requested one,
 * per {@link expandCalendarPrivilege}.
 *
 * @param granted - The privilege an ACE grants or denies.
 * @param requested - The privilege being checked for.
 * @returns Whether `granted` covers `requested`.
 */
export function calendarPrivilegeSatisfies(
  granted: CalendarPrivilege,
  requested: CalendarPrivilege,
): boolean {
  return expandCalendarPrivilege(granted).includes(requested);
}
