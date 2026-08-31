import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintColumnTransformer } from './bigint-column.transformer.js';

/** `Tenant.slug` may only contain lowercase letters, digits, and hyphens. */
const TENANT_SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * A tenant in DavNode's shared-schema multi-tenancy model. Every other
 * domain row (principals, WebDAV/CalDAV/CardDAV resources, ...) carries a
 * `tenantId` back to one of these. Tenants are addressed via a path prefix,
 * `/dav/{slug}/...` (see planning/05-data-model.md, URL-Schema).
 */
@Entity('tenants')
export class Tenant {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * URL-safe path segment identifying this tenant (`/dav/{slug}/...`).
   * Restricted to `[a-z0-9-]` and unique across all tenants.
   */
  @Column({ type: 'varchar', unique: true })
  slug!: string;

  /** Human-readable display name for this tenant. */
  @Column({ type: 'varchar' })
  name!: string;

  /**
   * Tenant-wide storage quota in bytes, shared across all of the tenant's
   * users. `null` means no limit is enforced.
   */
  @Column({
    type: 'bigint',
    nullable: true,
    transformer: bigintColumnTransformer,
  })
  quotaLimitBytes!: number | null;

  /**
   * Running total of bytes currently stored by this tenant's users, kept
   * up to date on every write/delete and periodically reconciled by a
   * recompute job (see planning/05-data-model.md, Quota).
   */
  @Column({
    type: 'bigint',
    default: 0,
    transformer: bigintColumnTransformer,
  })
  quotaUsedBytes!: number;

  /** Timestamp of tenant creation. */
  @CreateDateColumn()
  createdAt!: Date;

  /**
   * Rejects slugs that don't match the required `[a-z0-9-]` pattern. Runs
   * automatically before insert/update; not meant to be called directly.
   */
  @BeforeInsert()
  @BeforeUpdate()
  validateSlug(): void {
    if (!TENANT_SLUG_PATTERN.test(this.slug)) {
      throw new Error(
        `Invalid tenant slug "${this.slug}": only lowercase letters, digits, and hyphens are allowed.`,
      );
    }
  }
}
