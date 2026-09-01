import type { DataSource } from 'typeorm';
import { Principal } from '../entities/principal.entity.js';
import type { PrincipalSpecialKind } from '../entities/principal.entity.js';
import { Tenant } from '../entities/tenant.entity.js';
import { DuplicateEntryError, NotFoundError } from './errors.js';
import { isUniqueConstraintViolationError } from './unique-constraint.util.js';

/**
 * The special principals created for every new tenant. `self` is
 * deliberately excluded: RFC 3744 resolves it *contextually* ("the
 * requesting principal itself"), which is already covered by the ACL
 * evaluation engine always including the requesting principal's own id
 * in its matching set (M3) — no persisted row needed. `owner` **does**
 * need a persisted row (added in M3, milestones/M3-webdav-acl/03-acl-evaluation-engine):
 * unlike `self`, an ACE granting to `DAV:owner` is a *reusable* rule
 * ("whoever ends up owning this resource", not a concrete identity
 * known at ACE-creation time) — `CollectionAce.principalId`/
 * `FileAce.principalId` are foreign keys, so such an ACE can only exist
 * if a `DAV:owner` principal row exists for it to reference.
 */
const TENANT_SPECIAL_KINDS: readonly PrincipalSpecialKind[] = [
  'all',
  'authenticated',
  'unauthenticated',
  'owner',
];

/** Input for {@link TenantService.createTenant}. */
export interface CreateTenantInput {
  slug: string;
  name: string;
  quotaLimitBytes?: number | null;
}

/** Input for {@link TenantService.updateTenantQuota}. */
export interface UpdateTenantQuotaInput {
  quotaLimitBytes: number | null;
}

/**
 * Tenant management, backed directly by TypeORM repositories. Callers
 * (`@davnode/server`, and `@davnode/admin-api` from M9) go through this
 * service rather than touching TypeORM repositories themselves.
 */
export class TenantService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Creates a tenant and its per-tenant special principals (`all`,
   * `authenticated`, `unauthenticated`, `owner`) in a single
   * transaction: either both the tenant and all four principals exist
   * afterward, or none of them do.
   *
   * @throws {@link DuplicateEntryError} If `slug` is already in use.
   */
  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    return this.dataSource.transaction(async (manager) => {
      let tenant: Tenant;
      try {
        tenant = await manager.save(
          Tenant,
          manager.create(Tenant, {
            slug: input.slug,
            name: input.name,
            quotaLimitBytes: input.quotaLimitBytes ?? null,
          }),
        );
      } catch (error) {
        if (isUniqueConstraintViolationError(error)) {
          throw new DuplicateEntryError(
            'slug',
            `Tenant slug "${input.slug}" is already in use.`,
          );
        }
        throw error;
      }

      const specialPrincipals = TENANT_SPECIAL_KINDS.map((specialKind) =>
        manager.create(Principal, {
          tenantId: tenant.id,
          kind: 'special',
          specialKind,
        }),
      );
      await manager.save(Principal, specialPrincipals);

      return tenant;
    });
  }

  /**
   * Looks up a tenant by its slug.
   *
   * @returns The tenant, or `null` if no tenant has that slug.
   */
  async findTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.dataSource.getRepository(Tenant).findOneBy({ slug });
  }

  /**
   * Updates a tenant's storage quota limit.
   *
   * @throws {@link NotFoundError} If no tenant has `tenantId`.
   */
  async updateTenantQuota(
    tenantId: string,
    input: UpdateTenantQuotaInput,
  ): Promise<Tenant> {
    const repository = this.dataSource.getRepository(Tenant);
    const tenant = await repository.findOneBy({ id: tenantId });
    if (!tenant) {
      throw new NotFoundError(`Tenant "${tenantId}" not found.`);
    }
    tenant.quotaLimitBytes = input.quotaLimitBytes;
    return repository.save(tenant);
  }
}
