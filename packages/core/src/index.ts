/** Current version of the `@davnode/core` package. */
export const VERSION = '0.0.1';

export { AuthProviderRegistry } from './auth/auth-provider-registry.js';
export type { AuthProvider } from './auth/auth-provider.interface.js';
export { BasicAuthProvider } from './auth/basic-auth-provider.js';
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

export {
  type ParsedPrincipalUrl,
  parsePrincipalUrl,
  toPrincipalUrl,
} from './principals/principal-url.js';

export {
  isSpecialPrincipal,
  toSpecialPrincipalXmlElement,
} from './principals/special-principals.js';

export {
  CycleDetectedError,
  DuplicateEntryError,
  NotFoundError,
} from './services/errors.js';
export {
  type CreateTenantInput,
  TenantService,
  type UpdateTenantQuotaInput,
} from './services/tenant.service.js';
export {
  type CreateUserInput,
  type UpdateUserQuotaInput,
  UserService,
} from './services/user.service.js';
