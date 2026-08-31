import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Principal } from './principal.entity.js';
import { Tenant } from './tenant.entity.js';

/**
 * A WebDAV collection (folder) in a tenant's file hierarchy.
 * `parentCollectionId` is `null` for exactly one collection per tenant —
 * that tenant's root — and set for every sub-collection. There is
 * deliberately no generic `resources` table: collections and
 * `FileResource`s are separate tables (see planning/01-decisions.md,
 * Runde 10).
 */
@Entity('collections')
@Index(['tenantId', 'parentCollectionId'])
@Index(['tenantId'], { unique: true, where: 'parent_collection_id IS NULL' })
export class Collection {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the tenant this collection belongs to. */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this collection belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /**
   * Id of the parent collection, or `null` for the tenant's root
   * collection. See the class-level note on the one-root-per-tenant
   * invariant.
   */
  @Column({ type: 'uuid', nullable: true })
  parentCollectionId!: string | null;

  /** The parent collection, or `null` for the tenant's root collection. */
  @ManyToOne(() => Collection, { nullable: true })
  @JoinColumn({ name: 'parent_collection_id' })
  parentCollection!: Collection | null;

  /** Id of the principal that owns this collection. */
  @Column({ type: 'uuid' })
  ownerPrincipalId!: string;

  /** The principal that owns this collection. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'owner_principal_id' })
  ownerPrincipal!: Principal;

  /** Display name (`DAV:displayname`). */
  @Column({ type: 'varchar' })
  displayName!: string;

  /**
   * Monotonically increasing counter, bumped on every change to a direct
   * child. Unused before M4 (sync-collection REPORT / sync tokens); the
   * column exists from M2 onward so it's already being maintained by the
   * time M4 needs it.
   */
  @Column({ type: 'int', default: 0 })
  syncSeq!: number;

  /** Timestamp of collection creation. */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last change to this collection's own properties. */
  @UpdateDateColumn()
  updatedAt!: Date;
}
