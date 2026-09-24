import type { CalendarTextMatch } from './calendar-query-request.js';

/** Folds only ASCII letters to lower case, per `i;ascii-casemap` (RFC 4790 §3.3.1) — everything outside `A`–`Z` compares as-is (an accented or non-Latin letter is not folded). */
function foldAscii(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * Whether `value` contains `match.value` under `match`'s collation (RFC
 * 4791 §7.5/§9.7.5 — CalDAV text-match is always a substring test, never
 * `equals`/`starts-with`/`ends-with`), then applies `match.negate`.
 *
 * - `i;octet`: exact byte/character substring, case-sensitive.
 * - `i;ascii-casemap`/`default`: substring after folding only ASCII
 *   letters in both strings — matches the RFC 4790 definition exactly
 *   (unlike a full Unicode case fold, which CalDAV doesn't require).
 *
 * `match.collation` must already be one `SUPPORTED_CALENDAR_COLLATIONS`
 * holds — checked by `classifyCalendarFilter` before this runs.
 */
export function calendarTextMatches(
  value: string,
  match: CalendarTextMatch,
): boolean {
  const found =
    match.collation === 'i;octet'
      ? value.includes(match.value)
      : foldAscii(value).includes(foldAscii(match.value));
  return match.negate ? !found : found;
}
