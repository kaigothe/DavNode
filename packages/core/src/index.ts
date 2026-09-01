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
export type { DataSource } from 'typeorm';

export { ALL_MIGRATIONS as ALL_SQLITE_MIGRATIONS } from './migrations/sqlite/index.js';

export {
  ALL_ENTITIES,
  Collection,
  CollectionChange,
  COLLECTION_CHANGE_ACTIONS,
  type CollectionChangeAction,
  CollectionProperty,
  Credential,
  CREDENTIAL_TYPES,
  type CredentialType,
  FileContent,
  FileProperty,
  FileResource,
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
export {
  type CreateGroupInput,
  GroupService,
} from './services/group.service.js';
export { GroupMembershipService } from './services/group-membership.service.js';

export {
  type MultistatusPropertyResult,
  type MultistatusResourceResult,
  buildMultistatusResponse,
} from './webdav/xml/multistatus-builder.js';
export {
  DAV_NAMESPACE,
  type ProppatchOperation,
  type ProppatchRequestBody,
  type PropertyName,
  type PropfindRequestBody,
  parsePropfindRequestBody,
  parseProppatchRequestBody,
} from './webdav/xml/request-parser.js';

export { PropertyProviderRegistry } from './webdav/properties/property-provider-registry.js';
export type {
  PropertyProvider,
  PropertyValue,
  WebDavResource,
} from './webdav/properties/property-provider.interface.js';
export { WebDavLiveProperties } from './webdav/properties/webdav-live-properties.js';
export { DeadPropertyService } from './webdav/properties/dead-property.service.js';

export {
  ResourcePathResolver,
  type WebDavTreeResource,
} from './webdav/resource-path-resolver.js';
export { CollectionChangeService } from './webdav/collection-change.service.js';
