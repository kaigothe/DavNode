/**
 * Thrown when an operation would violate a uniqueness constraint the
 * caller can act on (e.g. a duplicate tenant slug or username) — a
 * translated, catchable alternative to the raw, driver-specific database
 * exception (Postgres' `23505`, MySQL's `ER_DUP_ENTRY`, or SQLite's
 * "UNIQUE constraint failed" message).
 */
export class DuplicateEntryError extends Error {
  /** Which field's uniqueness constraint was violated. */
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'DuplicateEntryError';
    this.field = field;
  }
}

/**
 * Thrown when an operation references an entity, by id or other
 * identifier, that doesn't exist.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown when adding a group membership would create a cycle (a group
 * that, transitively, contains itself).
 */
export class CycleDetectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CycleDetectedError';
  }
}
