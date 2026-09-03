import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AddressObject } from './address-object.entity.js';

/**
 * A "dead property" (RFC 4918) on an {@link AddressObject}: an arbitrary,
 * client-set property the server doesn't itself interpret, but must
 * persist and return as-is (via PROPPATCH/PROPFIND). Unique per
 * `(addressObjectId, namespace, name)` — setting the same property again
 * overwrites its value rather than creating a duplicate. Mirrors
 * `FileProperty` (M2) for the addressbook domain.
 *
 * **Live properties** (`getetag`, `getlastmodified`, `getcontenttype`,
 * `resourcetype`) are **not** stored here — they're derived from
 * `AddressObject`'s own fixed columns instead.
 */
@Entity('address_object_properties')
@Index(['addressObjectId', 'namespace', 'name'], { unique: true })
export class AddressObjectProperty {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the address object this property is set on. */
  @Column({ type: 'uuid' })
  addressObjectId!: string;

  /** The address object this property is set on. */
  @ManyToOne(() => AddressObject)
  @JoinColumn({ name: 'address_object_id' })
  addressObject!: AddressObject;

  /** XML namespace URI (e.g. `DAV:`, or a client-defined namespace). */
  @Column({ type: 'varchar' })
  namespace!: string;

  /** Local property name within this row's `namespace`. */
  @Column({ type: 'varchar' })
  name!: string;

  /** The property's value, as text (may be an XML fragment). */
  @Column({ type: 'text' })
  value!: string;
}
