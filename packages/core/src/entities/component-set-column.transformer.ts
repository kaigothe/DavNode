import type { ValueTransformer } from 'typeorm';

/**
 * TypeORM column transformer that stores a set of iCalendar component
 * names (`['VEVENT', 'VTODO']`) as one comma-separated `varchar`
 * (`'VEVENT,VTODO'`).
 *
 * A `varchar` rather than a JSON/`simple-array` (`text`) column because
 * `CalendarCollection.supportedComponentSet` needs a database-level
 * default (`'VEVENT'`): MySQL refuses a literal `DEFAULT` on a `TEXT`
 * column, and the three engines would otherwise disagree on the spelling
 * of a JSON default. Component names are `[A-Z]` tokens (RFC 5545 §3.6),
 * so a comma can never occur inside one.
 */
export const componentSetColumnTransformer: ValueTransformer = {
  to: (
    value: readonly string[] | null | undefined,
  ): string | null | undefined =>
    value === null || value === undefined ? value : value.join(','),
  // TypeORM also runs `from` over a value it just persisted from the entity
  // — for a column with a database default, right after the INSERT — which
  // is already an array, so parsing has to be idempotent.
  from: (value: string | readonly string[] | null): string[] | null => {
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      return [...value];
    }
    return value === '' ? [] : value.split(',');
  },
};
