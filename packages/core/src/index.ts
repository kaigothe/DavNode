/** Current version of the `@davnode/core` package. */
export const VERSION = '0.0.1';

export {
  createDataSource,
  createDataSourceOptions,
  type DavNodeDbEnv,
  type DavNodeDbSchema,
  type DavNodeDbType,
} from './db/data-source.js';

export {
  ALL_ENTITIES,
  Principal,
  PRINCIPAL_KINDS,
  PRINCIPAL_SPECIAL_KINDS,
  type PrincipalKind,
  type PrincipalSpecialKind,
  Tenant,
  User,
  USER_ROLES,
  type UserRole,
} from './entities/index.js';
