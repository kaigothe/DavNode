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
 * One occurrence of a searchable vCard property on an
 * {@link AddressObject} — e.g. one row per `EMAIL` address, so two
 * emails on the same contact produce two rows. Populated by
 * `indexVCard` (`carddav/index-vcard.ts`) whenever the contact's vCard
 * content is written, and meant to be queried by the future
 * `addressbook-query` REPORT instead of loading and re-parsing every
 * vCard blob on each filter request (planning/01-decisions.md,
 * Runde 20).
 *
 * `propertyValue` is normalized (lowercased, trimmed) for
 * case-insensitive comparison; the unmodified original stays in
 * `AddressObjectContent`'s raw vCard text — this table exists purely
 * for search, never as a source of truth.
 *
 * `propertyName` is a plain string, not a database-level enum: which
 * vCard properties get indexed is `indexVCard`'s decision (currently
 * `FN`, `N`, `EMAIL`, `TEL`, `ORG`, `NICKNAME`), and extending that set
 * later shouldn't require a schema migration here.
 */
@Entity('address_object_indexes')
@Index(['addressObjectId'])
export class AddressObjectIndex {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the address object this index row belongs to. */
  @Column({ type: 'uuid' })
  addressObjectId!: string;

  /**
   * The address object this index row belongs to. Deleting the address
   * object deletes its index rows too (`ON DELETE CASCADE`) — like
   * `AddressObjectContent`, these rows are always managed alongside
   * their parent and have no meaning on their own.
   */
  @ManyToOne(() => AddressObject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'address_object_id' })
  addressObject!: AddressObject;

  /** The indexed vCard property's name (e.g. `FN`, `EMAIL`). */
  @Column({ type: 'varchar' })
  propertyName!: string;

  /** The property's value, normalized (lowercased, trimmed) for search. */
  @Column({ type: 'text' })
  propertyValue!: string;
}
