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
import { AddressbookCollection } from './addressbook-collection.entity.js';
import { Principal } from './principal.entity.js';
import { Tenant } from './tenant.entity.js';

/**
 * A CardDAV contact (`.vcf` resource, RFC 6352) inside an
 * {@link AddressbookCollection}. Its raw vCard text lives separately, in
 * `AddressObjectContent` (mirroring the `FileResource`/`FileContent`
 * metadata/blob split from M2), so PROPFIND/property queries and
 * `addressbook-query` index lookups never have to load and re-parse
 * every contact's full vCard body.
 */
@Entity('address_objects')
@Index(['addressbookId', 'uid'], { unique: true })
export class AddressObject {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the tenant this address object belongs to. */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this address object belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /** Id of the parent addressbook. */
  @Column({ type: 'uuid' })
  addressbookId!: string;

  /** The parent addressbook. */
  @ManyToOne(() => AddressbookCollection)
  @JoinColumn({ name: 'addressbook_id' })
  addressbook!: AddressbookCollection;

  /**
   * The vCard `UID` property, unique within {@link AddressObject.addressbook}
   * (not tenant-wide) — the same `UID` may appear in a different
   * addressbook without conflict.
   */
  @Column({ type: 'varchar' })
  uid!: string;

  /** Opaque version identifier (`DAV:getetag`), changed on every write. */
  @Column({ type: 'varchar' })
  etag!: string;

  /** Id of the principal that owns this address object. */
  @Column({ type: 'uuid' })
  ownerPrincipalId!: string;

  /** The principal that owns this address object. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'owner_principal_id' })
  ownerPrincipal!: Principal;

  /** Timestamp of address object creation (`DAV:creationdate`). */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last write (`DAV:getlastmodified`). */
  @UpdateDateColumn()
  updatedAt!: Date;
}
