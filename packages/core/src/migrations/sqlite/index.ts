import type { MigrationInterface } from 'typeorm';
import { Baseline1788196779874 } from './1788196779874-Baseline.js';
import { CreateTenants1788210823167 } from './1788210823167-CreateTenants.js';
import { CreatePrincipals1788211597915 } from './1788211597915-CreatePrincipals.js';
import { CreateUsers1788211878093 } from './1788211878093-CreateUsers.js';
import { CreateGroups1788212097336 } from './1788212097336-CreateGroups.js';
import { CreateCredentials1788212518999 } from './1788212518999-CreateCredentials.js';
import { CreateCollections1788216873371 } from './1788216873371-CreateCollections.js';
import { CreateFileResources1788217588594 } from './1788217588594-CreateFileResources.js';
import { CreateDeadProperties1788218170869 } from './1788218170869-CreateDeadProperties.js';
import { CreateCollectionChanges1788275224055 } from './1788275224055-CreateCollectionChanges.js';
import { CreateAces1788279306695 } from './1788279306695-CreateAces.js';
import { CreateLocks1788292075341 } from './1788292075341-CreateLocks.js';
import { CreateAddressbooks1788454861226 } from './1788454861226-CreateAddressbooks.js';
import { CreateAddressObjects1788460094389 } from './1788460094389-CreateAddressObjects.js';
import { CreateAddressbookDeadProperties1788461159226 } from './1788461159226-CreateAddressbookDeadProperties.js';
import { CreateAddressbookAcesLocksChanges1788463385166 } from './1788463385166-CreateAddressbookAcesLocksChanges.js';
import { CreateAddressObjectIndex1788464771752 } from './1788464771752-CreateAddressObjectIndex.js';

/**
 * Every SQLite migration in `@davnode/core`, in chronological order. Used
 * to run migrations via `createDataSource`'s `schema` parameter (see
 * `DavNodeDbSchema` in `db/data-source.ts`) without relying on filesystem
 * globbing — needed wherever code runs directly against TypeScript
 * sources rather than the compiled `dist/` output, such as this package's
 * own test suite (which always runs against SQLite). Typed as generic
 * migration constructors, rather than the specific classes below, so
 * `ALL_SQLITE_MIGRATIONS`'s public re-export (see `index.ts`) doesn't
 * reference undocumented internal classes.
 */
export const ALL_MIGRATIONS: Array<new () => MigrationInterface> = [
  Baseline1788196779874,
  CreateTenants1788210823167,
  CreatePrincipals1788211597915,
  CreateUsers1788211878093,
  CreateGroups1788212097336,
  CreateCredentials1788212518999,
  CreateCollections1788216873371,
  CreateFileResources1788217588594,
  CreateDeadProperties1788218170869,
  CreateCollectionChanges1788275224055,
  CreateAces1788279306695,
  CreateLocks1788292075341,
  CreateAddressbooks1788454861226,
  CreateAddressObjects1788460094389,
  CreateAddressbookDeadProperties1788461159226,
  CreateAddressbookAcesLocksChanges1788463385166,
  CreateAddressObjectIndex1788464771752,
];
