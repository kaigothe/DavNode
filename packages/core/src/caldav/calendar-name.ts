/**
 * URL names under a calendar home that belong to the scheduling
 * collections (RFC 6638 §2.1–2.2, `.../calendars/{userId}/inbox/` and
 * `outbox/`, milestones/M7-caldav-scheduling) — never available to a
 * user's own calendar, so a calendar created now can't collide with
 * them once scheduling exists.
 */
export const RESERVED_CALENDAR_NAMES: readonly string[] = ['inbox', 'outbox'];

/**
 * The longest `CalendarCollection.name`/`displayName` (in Unicode code
 * points) the database holds: both are plain `varchar` columns, which
 * MySQL sizes at 255 characters (and rejects longer values in strict
 * mode) while Postgres would take any length. Enforcing the limit up
 * front keeps the two engines' behaviour identical.
 */
export const MAX_CALENDAR_NAME_LENGTH = 255;

/** Number of Unicode code points in `text` — what a MySQL `varchar(n)` counts. */
export function codePointLength(text: string): number {
  return [...text].length;
}

/**
 * Whether `name` can be the URL path segment of a new calendar: not
 * empty, not `.`/`..` (clients resolve those away, so the calendar would
 * be unreachable), no control characters (Postgres can't even store a
 * NUL, and none belongs into a URL), at most
 * {@link MAX_CALENDAR_NAME_LENGTH} characters, and not one of the
 * {@link RESERVED_CALENDAR_NAMES} (compared case-insensitively, because
 * MySQL's default collation would treat `Inbox` as the same name).
 */
export function isValidCalendarName(name: string): boolean {
  return (
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    // eslint-disable-next-line no-control-regex -- control characters are exactly what a calendar name must not contain.
    !/[\u0000-\u001F\u007F]/.test(name) &&
    codePointLength(name) <= MAX_CALENDAR_NAME_LENGTH &&
    !RESERVED_CALENDAR_NAMES.includes(name.toLowerCase())
  );
}

/**
 * Whether `name` can be the URL path segment of a new calendar object
 * resource: like {@link isValidCalendarName} — not empty, not `.`/`..`,
 * no control characters, at most {@link MAX_CALENDAR_NAME_LENGTH}
 * characters (the `varchar` the database holds) — but without the
 * reserved names, which only apply to calendars in the home.
 */
export function isValidCalendarObjectName(name: string): boolean {
  return (
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    // eslint-disable-next-line no-control-regex -- control characters are exactly what a resource name must not contain.
    !/[\u0000-\u001F\u007F]/.test(name) &&
    codePointLength(name) <= MAX_CALENDAR_NAME_LENGTH
  );
}
