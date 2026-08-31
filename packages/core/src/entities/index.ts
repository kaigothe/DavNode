import {
  Principal,
  PRINCIPAL_KINDS,
  PRINCIPAL_SPECIAL_KINDS,
  type PrincipalKind,
  type PrincipalSpecialKind,
} from './principal.entity.js';
import { Tenant } from './tenant.entity.js';
import { User, USER_ROLES, type UserRole } from './user.entity.js';

export {
  Principal,
  PRINCIPAL_KINDS,
  PRINCIPAL_SPECIAL_KINDS,
  type PrincipalKind,
  type PrincipalSpecialKind,
  Tenant,
  User,
  USER_ROLES,
  type UserRole,
};

/**
 * Every entity class registered in `@davnode/core`. Used to configure a
 * `DataSource` via `createDataSource`'s `schema` parameter (see
 * `DavNodeDbSchema` in `db/data-source.ts`) without relying on filesystem
 * globbing — needed wherever code runs directly against TypeScript
 * sources rather than the compiled `dist/` output, such as this package's
 * own test suite.
 */
export const ALL_ENTITIES = [Tenant, Principal, User];
