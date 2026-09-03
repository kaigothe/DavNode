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
 *
 * `name` and `uid` are deliberately separate, unique-checked
 * independently: `name` is this resource's own URL path segment,
 * client-chosen via PUT's target URL — the same role `FileResource.name`
 * plays (M2) — while `uid` is the vCard `UID` property's value.
 * RFC 6352 §6.3.2 requires a `409 Conflict` when a PUT's `UID` already
 * exists in the addressbook under a *different* URL, which is only
 * expressible if the two identities don't collapse into one column
 * (Große Aufgabe 4's AddressObject-CRUD sub-task, added retroactively —
 * the original Große Aufgabe 1 entity had only `uid`, which can't
 * represent "same UID, different URL" at all).
 */
@Entity('address_objects')
@Index(['addressbookId', 'name'], { unique: true })
@Index(['addressbookId', 'uid'])
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
   * This resource's own path segment (e.g. `contact.vcf`), unique within
   * {@link AddressObject.addressbook} — the URL identity PUT/GET/DELETE
   * resolve by, client-chosen exactly like `FileResource.name`.
   */
  @Column({ type: 'varchar' })
  name!: string;

  /**
   * The vCard `UID` property, unique *in practice* within
   * {@link AddressObject.addressbook} — enforced at the application level
   * (a 409 on PUT, RFC 6352 §6.3.2), not by a database constraint here,
   * since the same UID legitimately keeps its row across an update at
   * its own unchanged `name`. Not unique tenant-wide either — the same
   * `UID` may appear in a different addressbook without conflict.
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
