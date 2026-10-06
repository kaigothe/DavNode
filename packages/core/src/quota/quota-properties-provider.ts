import type { EntityManager } from 'typeorm';
import { Tenant } from '../entities/tenant.entity.js';
import { User } from '../entities/user.entity.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';

const QUOTA_PROPERTY_NAMES = new Set([
  'quota-used-bytes',
  'quota-available-bytes',
]);

/**
 * Reported for `DAV:quota-available-bytes` when neither the owner's own
 * limit nor their tenant's is set (RFC 4331 §3: "this specification
 * RECOMMENDS that servers return some appropriate value" even for
 * unlimited storage, since the element has no way to spell "infinite").
 * The same practical ceiling `bigintColumnTransformer` already assumes
 * no real byte count will ever approach.
 */
const QUOTA_UNLIMITED_PLACEHOLDER_BYTES = Number.MAX_SAFE_INTEGER;

function property(name: string, value: string): PropertyValue {
  return { namespace: DAV_NAMESPACE, name, value };
}

/**
 * `DAV:quota-used-bytes`/`DAV:quota-available-bytes` (RFC 4331) for the
 * principal that owns a resource — shared by every
 * {@link QuotaPropertiesProvider} instance regardless of which resource
 * tree it's registered into, since the numbers themselves never depend
 * on resource type (planning/05-data-model.md, "Quota" — account-wide,
 * not per-domain).
 *
 * `quota-used-bytes` is `User.quotaUsedBytes` verbatim.
 * `quota-available-bytes` is the more restrictive of the owner's own
 * remaining headroom and their tenant's (`limit - used` on whichever
 * side has a limit at all; `Math.min` of both if both do) — RFC 4331 §3
 * explicitly allows a
 * server to pick whichever of several overlapping limits it wants to
 * report, "SHOULD do so in a repeatable way", which `Math.min` is.
 * Neither limit set at all reports {@link QUOTA_UNLIMITED_PLACEHOLDER_BYTES}.
 */
async function computeQuotaProperties(
  manager: EntityManager,
  ownerPrincipalId: string,
): Promise<PropertyValue[]> {
  const owner = await manager
    .getRepository(User)
    .findOneByOrFail({ principalId: ownerPrincipalId });
  const tenant = await manager
    .getRepository(Tenant)
    .findOneByOrFail({ id: owner.tenantId });

  const userAvailable =
    owner.quotaLimitBytes === null
      ? null
      : owner.quotaLimitBytes - owner.quotaUsedBytes;
  const tenantAvailable =
    tenant.quotaLimitBytes === null
      ? null
      : tenant.quotaLimitBytes - tenant.quotaUsedBytes;

  let available: number;
  if (userAvailable === null && tenantAvailable === null) {
    available = QUOTA_UNLIMITED_PLACEHOLDER_BYTES;
  } else if (userAvailable === null) {
    available = tenantAvailable as number;
  } else if (tenantAvailable === null) {
    available = userAvailable;
  } else {
    available = Math.min(userAvailable, tenantAvailable);
  }

  return [
    property('quota-used-bytes', String(owner.quotaUsedBytes)),
    property('quota-available-bytes', String(available)),
  ];
}

/**
 * The RFC 4331 quota live properties, registered identically into the
 * WebDAV (`WebDavResource`), CalDAV (`CalendarHomeTreeResource`) and
 * CardDAV (`AddressbookHomeTreeResource`) property-provider registries
 * (M8 Große Aufgabe 4) alongside each tree's own existing provider —
 * one generic class rather than three near-duplicates, since every
 * member of all three resource-tree unions already carries its owner's
 * principal id as `ownerPrincipalId` (a real column on every persisted
 * collection/object entity, a plain constructor field on the synthetic
 * `CalendarHomeCollection`/`AddressbookHomeCollection`).
 *
 * Reports the *resource's own owner's* quota, not the requesting
 * principal's — someone with read-only ACL access to another user's
 * calendar sees *that user's* usage, matching
 * `milestones/M8-quota/04-quota-properties/01-quota-live-properties.md`.
 */
export class QuotaPropertiesProvider<
  TResource extends { ownerPrincipalId: string },
> implements PropertyProvider<TResource> {
  /** See {@link PropertyProvider.listLiveProperties}. */
  async listLiveProperties(
    resource: TResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    return computeQuotaProperties(context.manager, resource.ownerPrincipalId);
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && QUOTA_PROPERTY_NAMES.has(name);
  }
}
