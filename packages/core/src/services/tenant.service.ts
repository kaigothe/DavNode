import type { DataSource } from 'typeorm';
import { Principal } from '../entities/principal.entity.js';
import type { PrincipalSpecialKind } from '../entities/principal.entity.js';
import { Tenant } from '../entities/tenant.entity.js';
import { DuplicateEntryError, NotFoundError } from './errors.js';
import { isUniqueConstraintViolationError } from './unique-constraint.util.js';

/**
 * The special principals created for every new tenant. `owner` and
 * `self` are deliberately excluded: RFC 3744 resolves those two
 * *contextually* ("the resource's owner", "the requesting principal
 * itself"), so — unlike `all`/`authenticated`/`unauthenticated`, which
 * are fixed, context-independent identities — they don't need a
 * persisted per-tenant row of their own.
 */
const TENANT_SPECIAL_KINDS: readonly PrincipalSpecialKind[] = [
  'all',
  'authenticated',
  'unauthenticated',
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
   * `authenticated`, `unauthenticated`) in a single transaction: either
   * both the tenant and all three principals exist afterward, or none of
   * them do.
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
