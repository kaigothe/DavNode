import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AddressbookCollection } from './addressbook-collection.entity.js';

/**
 * A "dead property" (RFC 4918) on an {@link AddressbookCollection}: an
 * arbitrary, client-set property the server doesn't itself interpret,
 * but must persist and return as-is (via PROPPATCH/PROPFIND). Unique per
 * `(addressbookId, namespace, name)` — setting the same property again
 * overwrites its value rather than creating a duplicate. Mirrors
 * `CollectionProperty` (M2) for the addressbook domain.
 *
 * **Live properties** (`displayname`, `getetag`, `getlastmodified`,
 * `resourcetype`, `CARD:addressbook-description`) are **not** stored
 * here — they're derived from `AddressbookCollection`'s own fixed
 * columns instead.
 */
@Entity('addressbook_properties')
@Index(['addressbookId', 'namespace', 'name'], { unique: true })
export class AddressbookProperty {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the addressbook this property is set on. */
  @Column({ type: 'uuid' })
  addressbookId!: string;

  /** The addressbook this property is set on. */
  @ManyToOne(() => AddressbookCollection)
  @JoinColumn({ name: 'addressbook_id' })
  addressbook!: AddressbookCollection;

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
