import { Baseline1788196779874 } from './1788196779874-Baseline.js';
import { CreateTenants1788210823167 } from './1788210823167-CreateTenants.js';
import { CreatePrincipals1788211597915 } from './1788211597915-CreatePrincipals.js';
import { CreateUsers1788211878093 } from './1788211878093-CreateUsers.js';
import { CreateGroups1788212097336 } from './1788212097336-CreateGroups.js';
import { CreateCredentials1788212518999 } from './1788212518999-CreateCredentials.js';
import { CreateCollections1788216873371 } from './1788216873371-CreateCollections.js';

/**
 * Every SQLite migration in `@davnode/core`, in chronological order. Used
 * to run migrations via `createDataSource`'s `schema` parameter (see
 * `DavNodeDbSchema` in `db/data-source.ts`) without relying on filesystem
 * globbing — needed wherever code runs directly against TypeScript
 * sources rather than the compiled `dist/` output, such as this package's
 * own test suite (which always runs against SQLite).
 */
export const ALL_MIGRATIONS = [
  Baseline1788196779874,
  CreateTenants1788210823167,
  CreatePrincipals1788211597915,
  CreateUsers1788211878093,
  CreateGroups1788212097336,
  CreateCredentials1788212518999,
  CreateCollections1788216873371,
];
