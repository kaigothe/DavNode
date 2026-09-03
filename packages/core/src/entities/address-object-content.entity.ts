import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AddressObject } from './address-object.entity.js';

/**
 * The raw vCard text of an {@link AddressObject}, split into its own
 * table (mirroring `FileContent`, M2) so PROPFIND/property queries and
 * index lookups never have to load every contact's full vCard body.
 * Stored as `text`, not a driver-specific blob type — unlike
 * `FileContent.data` (arbitrary binary), a vCard is always UTF-8 text
 * (RFC 6350 §3.1), so there's no cross-driver blob type to reconcile.
 */
@Entity('address_object_contents')
export class AddressObjectContent {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the address object this content belongs to. */
  @Column({ type: 'uuid', unique: true })
  addressObjectId!: string;

  /**
   * The address object this content belongs to. Deleting the address
   * object deletes its content too (`ON DELETE CASCADE`) — the two are
   * always created and deleted together at the service level (PUT/DELETE,
   * see the AddressObject-CRUD tasks), and content has no meaning on its
   * own.
   */
  @OneToOne(() => AddressObject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'address_object_id' })
  addressObject!: AddressObject;

  /** The raw vCard text. */
  @Column({ type: 'text' })
  vcardData!: string;
}
