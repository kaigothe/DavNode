import { Baseline1788196779874 } from './1788196779874-Baseline.js';
import { CreateTenants1788210823167 } from './1788210823167-CreateTenants.js';

/**
 * Every migration in `@davnode/core`, in chronological order. Used to run
 * migrations via `createDataSource`'s `schema` parameter (see
 * `DavNodeDbSchema` in `db/data-source.ts`) without relying on filesystem
 * globbing — needed wherever code runs directly against TypeScript
 * sources rather than the compiled `dist/` output, such as this package's
 * own test suite.
 */
export const ALL_MIGRATIONS = [
  Baseline1788196779874,
  CreateTenants1788210823167,
];
