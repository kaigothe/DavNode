import type { ValueTransformer } from 'typeorm';

/**
 * TypeORM column transformer that stores a `Date` as milliseconds since
 * the Unix epoch in a `bigint` column, and hands it back as a `Date`.
 *
 * Used for the calendar time-range index (`CalendarObject.dtstart`/
 * `dtend`/`recurrenceSpanEnd`) instead of a plain `Date` column, which
 * TypeORM maps to Postgres `timestamp` / MySQL `datetime` — both
 * *without* a time zone. The driver then writes the Date's wall-clock
 * time in the server process's zone, so with a zone that observes
 * daylight saving, two different instants in the autumn "repeated hour"
 * are stored as the same value and range comparisons around it come out
 * wrong (verified on both engines; SQLite happens to store UTC). An
 * epoch integer has no zone, compares identically on every engine and
 * indexes well — exactly what the `calendar-query` time-range prefilter
 * needs. `bigint` because milliseconds since 1970 no longer fit 32 bits.
 *
 * Applies to entity persistence and to `find()` operators such as
 * `LessThan(date)`. It does **not** apply to parameters of a
 * hand-written `QueryBuilder` clause, which must be passed as epoch
 * milliseconds (`date.getTime()`) themselves.
 */
export const epochMillisDateTransformer: ValueTransformer = {
  to: (value: Date | null | undefined): number | null | undefined => {
    if (value === null || value === undefined) {
      return value;
    }
    const millis = value.getTime();
    if (Number.isNaN(millis)) {
      throw new Error('Cannot store an invalid Date.');
    }
    return millis;
  },
  // Postgres and MySQL return `bigint` as a string, SQLite as a number.
  // TypeORM also runs `from` over a value it just persisted from the
  // entity, which is already a Date, so this has to be idempotent.
  from: (value: string | number | Date | null): Date | null => {
    if (value === null) {
      return null;
    }
    return value instanceof Date ? value : new Date(Number(value));
  },
};
