import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FileResource } from './file-resource.entity.js';

/**
 * A "dead property" (RFC 4918) on a {@link FileResource}: an arbitrary,
 * client-set property the server doesn't itself interpret, but must
 * persist and return as-is (via PROPPATCH/PROPFIND). Unique per
 * `(fileResourceId, namespace, name)` — setting the same property again
 * overwrites its value rather than creating a duplicate.
 *
 * **Live properties** (`displayname`, `getcontentlength`,
 * `getcontenttype`, `getetag`, `getlastmodified`, `creationdate`,
 * `resourcetype`) are **not** stored here — they're derived from
 * `FileResource`'s own fixed columns instead (see the property-provider
 * abstraction, milestones/M2-webdav-core/03-webdav-xml-property-infrastructure).
 */
@Entity('file_properties')
@Index(['fileResourceId', 'namespace', 'name'], { unique: true })
export class FileProperty {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the file resource this property is set on. */
  @Column({ type: 'uuid' })
  fileResourceId!: string;

  /** The file resource this property is set on. */
  @ManyToOne(() => FileResource)
  @JoinColumn({ name: 'file_resource_id' })
  fileResource!: FileResource;

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
