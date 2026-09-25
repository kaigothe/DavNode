/** Current version of the `@davnode/core` package. */
export const VERSION = '0.0.1';

export { AuthProviderRegistry } from './auth/auth-provider-registry.js';
export type { AuthProvider } from './auth/auth-provider.interface.js';
export { BasicAuthProvider } from './auth/basic-auth-provider.js';
export { hashPassword, verifyPassword } from './auth/password-hashing.js';

export {
  ALL_PRIVILEGES,
  CALENDAR_PRIVILEGES,
  type CalendarPrivilege,
  type Privilege,
} from './acl/privilege.js';
export {
  calendarPrivilegeSatisfies,
  expandCalendarPrivilege,
  expandPrivilege,
  privilegeSatisfies,
} from './acl/privilege-aggregation.js';
export {
  createOwnerAllAce,
  type OwnerAceResourceType,
} from './acl/create-owner-ace.js';
export {
  collectAces,
  collectWebDavAces,
  collectAddressbookAces,
  collectCalendarAces,
  type AceLike,
  type CollectedAce,
} from './acl/collect-aces.js';
export {
  hasPrivilege,
  getCurrentUserPrivilegeSet,
  hasAddressbookPrivilege,
  hasCalendarPrivilege,
  selectAddressObjectsWithPrivilege,
  selectCalendarObjectsWithPrivilege,
} from './acl/evaluate-privilege.js';
export {
  parseAclRequestBody,
  type AclRequestAce,
  type AclRequestBody,
} from './acl/acl-request-parser.js';
export { AclPropertiesProvider } from './acl/acl-properties-provider.js';
export {
  parsePrincipalPropertySearchRequestBody,
  PrincipalPropertySearchReportHandler,
  type PropertySearchCriterion,
  type PrincipalPropertySearchRequestBody,
} from './acl/principal-property-search-report.js';

export {
  createDataSource,
  createDataSourceOptions,
  type DavNodeDbEnv,
  type DavNodeDbSchema,
  type DavNodeDbType,
} from './db/data-source.js';
export type { DataSource, EntityManager } from 'typeorm';

export { ALL_MIGRATIONS as ALL_SQLITE_MIGRATIONS } from './migrations/sqlite/index.js';

export {
  ALL_ENTITIES,
  AddressbookAce,
  AddressbookChange,
  AddressbookCollection,
  AddressbookLock,
  AddressbookProperty,
  AddressObject,
  AddressObjectAce,
  AddressObjectContent,
  AddressObjectIndex,
  AddressObjectLock,
  AddressObjectProperty,
  CalendarCollection,
  CALENDAR_COMPONENT_TYPES,
  type CalendarComponentType,
  CalendarObject,
  CalendarObjectContent,
  CalendarObjectProperty,
  CalendarProperty,
  CalendarAce,
  CalendarChange,
  CalendarLock,
  CalendarObjectAce,
  CalendarObjectLock,
  CALENDAR_STATUS_VALUES,
  CALENDAR_TRANSPARENCY_VALUES,
  type CalendarStatus,
  type CalendarTransparency,
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
  SchedulingInboxItem,
  SCHEDULING_METHODS,
  type SchedulingMethod,
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
  VirtualPrincipalCollection,
  type PrincipalTreeResource,
  type VirtualPrincipalCollectionKind,
} from './principals/principal-tree-resource.js';
export { PrincipalLiveProperties } from './principals/principal-live-properties.js';

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
export { buildMkcolResponse } from './webdav/xml/mkcol-response-builder.js';
export {
  buildErrorResponse,
  type ErrorCondition,
} from './webdav/xml/error-response-builder.js';
export {
  DAV_NAMESPACE,
  type MkcolRequestBody,
  type MkcolSetProperty,
  type ProppatchOperation,
  type ProppatchRequestBody,
  type PropertyName,
  type PropfindRequestBody,
  parseMkcolRequestBody,
  parsePropfindRequestBody,
  parseProppatchRequestBody,
} from './webdav/xml/request-parser.js';

export { PropertyProviderRegistry } from './webdav/properties/property-provider-registry.js';
export type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
  WebDavResource,
} from './webdav/properties/property-provider.interface.js';
export { WebDavLiveProperties } from './webdav/properties/webdav-live-properties.js';
export { DeadPropertyService } from './webdav/properties/dead-property.service.js';

export {
  ResourcePathResolver,
  resolveCollectionHref,
  resolveResourceHref,
  type WebDavTreeResource,
} from './webdav/resource-path-resolver.js';
export { CollectionChangeService } from './webdav/collection-change.service.js';
export { ResourceTreeService } from './webdav/resource-tree.service.js';

export {
  getEffectiveLocks,
  getEffectiveWebDavLocks,
  getEffectiveAddressbookLocks,
  getEffectiveCalendarLocks,
  type EffectiveLock,
  type LockLike,
} from './webdav/locking/collect-locks.js';
export { wouldConflict } from './webdav/locking/check-lock-conflict.js';
export { hasValidLockToken } from './webdav/locking/check-lock-token.js';
export {
  buildActiveLockXml,
  buildLockDiscoveryContent,
  type RootedLock,
} from './webdav/locking/lock-discovery.js';
export {
  parseLockInfoRequestBody,
  type LockInfoRequestBody,
} from './webdav/locking/lock-request-parser.js';
export { LockPropertiesProvider } from './webdav/locking/lock-properties-provider.js';

export {
  encodeSyncToken,
  decodeSyncToken,
  type DecodedSyncToken,
} from './webdav/sync/sync-token.js';
export {
  validateSyncToken,
  type SyncTokenValidationResult,
} from './webdav/sync/validate-sync-token.js';
export {
  parseSyncCollectionRequestBody,
  type SyncCollectionRequestBody,
} from './webdav/sync/sync-collection-request-parser.js';
export { SyncCollectionReportHandler } from './webdav/sync/sync-collection-report.js';
export {
  CollectionChangeLog,
  type ChangeEntry,
  type ChangeLogRepository,
} from './webdav/sync/change-log.js';
export type {
  SyncCollectionDomain,
  SyncCollectionMember,
  SyncCollectionTarget,
} from './webdav/sync/sync-collection-domain.js';
export { WebDavSyncCollectionDomain } from './webdav/sync/webdav-sync-domain.js';

export {
  ReportRegistry,
  parseReportRootElement,
  type ReportContext,
  type ReportHandler,
  type ReportResult,
} from './webdav/report-registry.js';

export {
  parseVCard,
  VCardParseError,
  type ParsedVCard,
} from './carddav/vcard-parser.js';
export {
  indexVCard,
  INDEXED_PROPERTY_NAMES,
  normalizeIndexValue,
} from './carddav/index-vcard.js';
export { CARDDAV_NAMESPACE } from './carddav/carddav-namespace.js';
export { toAddressbookHomeUrl } from './carddav/addressbook-home-url.js';
export {
  AddressbookHomeCollection,
  type AddressbookHomeTreeResource,
} from './carddav/addressbook-home-tree-resource.js';
export { AddressbookLiveProperties } from './carddav/addressbook-live-properties.js';
export { AddressObjectLiveProperties } from './carddav/address-object-live-properties.js';
export { AddressbookChangeLog } from './carddav/addressbook-change-log.js';
export { AddressbookSyncCollectionDomain } from './carddav/addressbook-sync-domain.js';
export {
  AddressbookMultigetReportHandler,
  parseAddressbookMultigetRequestBody,
  type AddressbookMultigetRequestBody,
} from './carddav/addressbook-multiget-report.js';
export {
  AddressbookQueryReportHandler,
  MAX_QUERY_RESULTS,
} from './carddav/addressbook-query-report.js';
export {
  MAX_FILTER_CONDITIONS,
  parseAddressbookQueryRequestBody,
  type AddressbookFilter,
  type AddressbookQueryRequestBody,
  type ParamFilter,
  type PropFilter,
  type TextMatch,
  type TextMatchType,
} from './carddav/addressbook-query-request.js';
export {
  buildFilterCondition,
  findUnsupportedFilterParts,
  unsupportedFilterResult,
  type FilterCondition,
  type UnsupportedFilterParts,
} from './carddav/addressbook-query-filter.js';
export {
  parseReportPropertySelection,
  type AddressDataRequest,
  type ReportPropertySelection,
} from './carddav/addressbook-report-request.js';
export {
  filterVCardProperties,
  readVCardVersion,
  type VCardPropertySelector,
} from './carddav/vcard-partial.js';
export {
  CalendarParseError,
  parseCalendarObject,
  type CalendarPrecondition,
  type CalendarTime,
  type CalendarTimeKind,
  type ParsedCalendarObject,
  type ParsedComponent,
  type ParsedRecurrenceDate,
} from './caldav/icalendar-parser.js';
export {
  UnknownTimezoneError,
  ZoneRegistry,
  type ParsedTimezone,
  type WallClock,
} from './caldav/calendar-zones.js';
export {
  addWallDays,
  durationMillis,
  endMs,
  startMs,
  toInstantMs,
  type TimeResolution,
} from './caldav/calendar-time.js';
export {
  MAX_RECURRENCE_INSTANCES,
  MAX_SPAN_INSTANCES,
  RecurrenceLimitError,
  computeRecurrenceSpanEnd,
  expandOccurrences,
  type ExpandOptions,
  type Occurrence,
  type RecurrenceOptions,
} from './caldav/expand-recurrence.js';
export {
  FLOATING_TIME_OFFSET_BOUNDS_MS,
  computeTimeRangeIndex,
  indexCalendarObject,
  type TimeRangeIndex,
} from './caldav/index-calendar-object.js';
export { AddressbookHomeSetProperty } from './carddav/addressbook-home-set-property.js';
export { CALDAV_NAMESPACE } from './caldav/caldav-namespace.js';
export { CalendarChangeLog } from './caldav/calendar-change-log.js';
export { CalendarObjectLiveProperties } from './caldav/calendar-object-live-properties.js';
export {
  resolveReportCalendar,
  checkSupportedCalendarData,
  buildCalendarObjectResponses,
  calendarObjectNameOf,
  findCalendarObjectsByName,
} from './caldav/calendar-report-support.js';
export { CalendarSyncCollectionDomain } from './caldav/calendar-sync-domain.js';
export {
  parseUtcDateTime,
  CALENDAR_DATA_PROPERTY,
  InvalidExpandRangeError,
  parseCalendarReportPropertySelection,
  type CalendarDataRequest,
  type CalendarReportPropertySelection,
} from './caldav/calendar-report-request.js';
export {
  SUPPORTED_CALENDAR_COLLATIONS,
  parseFilterElement,
  parseTimeRangeElement,
  classifyCalendarFilter,
  parseCalendarQueryRequestBody,
  type CalendarTimeRangeFilter,
  type CalendarTextMatch,
  type CalendarPropFilter,
  type CalendarFilter,
  type UnsupportedCalendarFilterParts,
  type CalendarQueryRequestBody,
} from './caldav/calendar-query-request.js';
export {
  parseCalendarMultigetRequestBody,
  type CalendarMultigetRequestBody,
} from './caldav/calendar-multiget-request.js';
export { parseFreeBusyQueryRequestBody } from './caldav/free-busy-query-request.js';
export { resolveReportFloatingTimeZone } from './caldav/calendar-query-timezone.js';
export { calendarTextMatches } from './caldav/calendar-text-match.js';
export { renderExpandedCalendarData } from './caldav/calendar-data-expand.js';
export { CalendarMultigetReportHandler } from './caldav/calendar-multiget-report.js';
export {
  CalendarQueryReportHandler,
  MAX_QUERY_RESULTS as MAX_CALENDAR_QUERY_RESULTS,
  matchesTimeRange,
  matchesPropFilters,
} from './caldav/calendar-query-report.js';
export { FreeBusyQueryReportHandler } from './caldav/free-busy-query-report.js';
export type { CalendarAclResource } from './caldav/calendar-acl-resource.js';
export {
  toCalendarHomeUrl,
  toCalendarObjectUrl,
  toCalendarUrl,
} from './caldav/calendar-home-url.js';
export {
  CalendarHomeCollection,
  type CalendarHomeTreeResource,
} from './caldav/calendar-home-tree-resource.js';
export { CalendarLiveProperties } from './caldav/calendar-live-properties.js';
export { CalendarHomeSetProperty } from './caldav/calendar-home-set-property.js';
export {
  calendarUserAddressesFor,
  SchedulingPrincipalProperties,
} from './scheduling/scheduling-principal-properties.js';
export {
  detectSchedulingRole,
  extractSchedulingParticipants,
  resolveLocalPrincipalForAddress,
  schedulingComponentOf,
  type SchedulingAttendee,
  type SchedulingParticipants,
  type SchedulingRole,
} from './scheduling/detect-scheduling-role.js';
export {
  buildCancelMessage,
  buildReplyMessage,
  buildRequestMessage,
} from './scheduling/build-itip-message.js';
export {
  RESERVED_CALENDAR_NAMES,
  MAX_CALENDAR_NAME_LENGTH,
  isValidCalendarName,
  isValidCalendarObjectName,
} from './caldav/calendar-name.js';
export { parseCalendarTimezone } from './caldav/calendar-timezone.js';
export {
  MkcalendarBodyError,
  parseMkcalendarRequestBody,
  type MkcalendarBodyErrorKind,
  type MkcalendarChildElement,
  type MkcalendarRequestBody,
  type MkcalendarSetProperty,
} from './caldav/mkcalendar-request.js';
export {
  interpretMkcalendarProperties,
  type CalendarInitialization,
  type MkcalendarInterpretation,
} from './caldav/mkcalendar-properties.js';
export { buildMkcalendarResponse } from './caldav/mkcalendar-response-builder.js';
export {
  createCalendarCollection,
  type NewCalendar,
} from './caldav/create-calendar.js';
export { isUniqueConstraintViolationError } from './services/unique-constraint.util.js';
export { CalendarChangeService } from './caldav/calendar-change.service.js';
export { MAX_CALENDAR_OBJECT_BYTES } from './caldav/calendar-limits.js';
export {
  CalendarObjectChangedError,
  CalendarUidConflictError,
  deleteCalendarObject,
  saveCalendarObject,
  type DeleteCalendarObjectInput,
  type SaveCalendarObjectInput,
  type SavedCalendarObject,
} from './caldav/calendar-object-writes.js';
export {
  generateFeedToken,
  revokeFeedToken,
} from './caldav/feed-token.service.js';
export {
  buildCalendarFeed,
  loadCalendarFeedIcsData,
} from './caldav/calendar-feed.js';
export { requestsAddressbookResourcetype } from './carddav/mkcol-addressbook-request.js';
export { AddressbookChangeService } from './carddav/addressbook-change.service.js';
export type { AddressbookAclResource } from './carddav/addressbook-acl-resource.js';
