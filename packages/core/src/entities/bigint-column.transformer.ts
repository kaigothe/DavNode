import type { ValueTransformer } from 'typeorm';

/**
 * TypeORM column transformer for `bigint`-typed columns that store plain
 * byte counts (e.g. quota limits/usage). Every supported driver (Postgres,
 * MySQL, SQLite) returns `bigint` columns as strings by default, since SQL
 * `bigint` exceeds JavaScript's safe integer range; this transformer
 * converts them back to `number` for convenience, on the assumption that
 * no single byte-count value will ever approach `Number.MAX_SAFE_INTEGER`
 * (about 9 petabytes).
 */
export const bigintColumnTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | null): number | null =>
    value === null ? null : Number(value),
};
