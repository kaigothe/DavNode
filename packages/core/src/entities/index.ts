import { Collection } from './collection.entity.js';
import {
  CollectionAce,
  GRANT_DENY_VALUES,
  type GrantDeny,
} from './collection-ace.entity.js';
import {
  CollectionChange,
  COLLECTION_CHANGE_ACTIONS,
  type CollectionChangeAction,
} from './collection-change.entity.js';
import {
  CollectionLock,
  LOCK_DEPTH_VALUES,
  LOCK_SCOPE_VALUES,
  type LockDepth,
  type LockScope,
} from './collection-lock.entity.js';
import { CollectionProperty } from './collection-property.entity.js';
import {
  Credential,
  CREDENTIAL_TYPES,
  type CredentialType,
} from './credential.entity.js';
import { FileAce } from './file-ace.entity.js';
import { FileContent } from './file-content.entity.js';
import { FileLock } from './file-lock.entity.js';
import { FileProperty } from './file-property.entity.js';
import { FileResource } from './file-resource.entity.js';
import { Group } from './group.entity.js';
import { GroupMembership } from './group-membership.entity.js';
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
  Collection,
  CollectionAce,
  GRANT_DENY_VALUES,
  type GrantDeny,
  CollectionChange,
  COLLECTION_CHANGE_ACTIONS,
  type CollectionChangeAction,
  CollectionLock,
  LOCK_DEPTH_VALUES,
  LOCK_SCOPE_VALUES,
  type LockDepth,
  type LockScope,
  CollectionProperty,
  Credential,
  CREDENTIAL_TYPES,
  type CredentialType,
  FileAce,
  FileContent,
  FileLock,
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
};

/**
 * Every entity class registered in `@davnode/core`. Used to configure a
 * `DataSource` via `createDataSource`'s `schema` parameter (see
 * `DavNodeDbSchema` in `db/data-source.ts`) without relying on filesystem
 * globbing — needed wherever code runs directly against TypeScript
 * sources rather than the compiled `dist/` output, such as this package's
 * own test suite.
 */
export const ALL_ENTITIES = [
  Tenant,
  Principal,
  User,
  Group,
  GroupMembership,
  Credential,
  Collection,
  FileResource,
  FileContent,
  CollectionProperty,
  FileProperty,
  CollectionChange,
  CollectionAce,
  FileAce,
  CollectionLock,
  FileLock,
];
