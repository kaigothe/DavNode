/** Current version of the `@davnode/core` package. */
export const VERSION = '0.0.1';

export { hashPassword, verifyPassword } from './auth/password-hashing.js';

export {
  createDataSource,
  createDataSourceOptions,
  type DavNodeDbEnv,
  type DavNodeDbSchema,
  type DavNodeDbType,
} from './db/data-source.js';

export {
  ALL_ENTITIES,
  Credential,
  CREDENTIAL_TYPES,
  type CredentialType,
  Group,
  GroupMembership,
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
