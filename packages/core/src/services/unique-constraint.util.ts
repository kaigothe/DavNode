import { QueryFailedError } from 'typeorm';

/** Shape of the fields drivers attach to a unique-violation error. */
interface UniqueViolationDriverError {
  code?: string;
  errno?: number;
  message?: string;
}

/**
 * Whether `error` represents a unique/duplicate-key constraint
 * violation. Each supported driver reports this differently — Postgres
 * uses SQLSTATE `23505`, MySQL uses errno `1062`/code `ER_DUP_ENTRY`, and
 * better-sqlite3 puts "UNIQUE constraint failed" in the message — so this
 * checks all three shapes rather than assuming one.
 *
 * Doesn't identify *which* constraint fired; callers that only have one
 * plausible unique constraint on the table they just wrote to (as is the
 * case for every current caller in `services/`) can safely attribute any
 * match to that constraint.
 */
export function isUniqueConstraintViolationError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as UniqueViolationDriverError;
  if (driverError.code === '23505') {
    return true; // Postgres: unique_violation
  }
  if (driverError.code === 'ER_DUP_ENTRY' || driverError.errno === 1062) {
    return true; // MySQL
  }
  return (
    typeof driverError.message === 'string' &&
    driverError.message.includes('UNIQUE constraint failed')
  ); // better-sqlite3
}
