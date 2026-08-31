import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Collection } from './collection.entity.js';

/**
 * A "dead property" (RFC 4918) on a {@link Collection}: an arbitrary,
 * client-set property the server doesn't itself interpret, but must
 * persist and return as-is (via PROPPATCH/PROPFIND). Unique per
 * `(collectionId, namespace, name)` — setting the same property again
 * overwrites its value rather than creating a duplicate.
 *
 * **Live properties** (`displayname`, `getcontentlength`,
 * `getcontenttype`, `getetag`, `getlastmodified`, `creationdate`,
 * `resourcetype`) are **not** stored here — they're derived from
 * `Collection`'s own fixed columns instead (see the property-provider
 * abstraction, milestones/M2-webdav-core/03-webdav-xml-property-infrastructure).
 */
@Entity('collection_properties')
@Index(['collectionId', 'namespace', 'name'], { unique: true })
export class CollectionProperty {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the collection this property is set on. */
  @Column({ type: 'uuid' })
  collectionId!: string;

  /** The collection this property is set on. */
  @ManyToOne(() => Collection)
  @JoinColumn({ name: 'collection_id' })
  collection!: Collection;

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
