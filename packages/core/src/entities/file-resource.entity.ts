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
import { bigintColumnTransformer } from './bigint-column.transformer.js';
import { Collection } from './collection.entity.js';
import { Principal } from './principal.entity.js';
import { Tenant } from './tenant.entity.js';

/**
 * A WebDAV file's metadata, inside a {@link Collection}. Its binary
 * content lives separately, in `FileContent` (Runde 10), so
 * PROPFIND/property queries never have to load large blobs. `name` is
 * unique within its parent collection, not tenant-wide.
 */
@Entity('file_resources')
@Index(['collectionId', 'name'], { unique: true })
export class FileResource {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the tenant this file belongs to. */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The tenant this file belongs to. */
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  /** Id of the parent collection. */
  @Column({ type: 'uuid' })
  collectionId!: string;

  /** The parent collection. */
  @ManyToOne(() => Collection)
  @JoinColumn({ name: 'collection_id' })
  collection!: Collection;

  /** File name, unique within {@link FileResource.collection}. */
  @Column({ type: 'varchar' })
  name!: string;

  /** MIME type (`DAV:getcontenttype`). */
  @Column({ type: 'varchar' })
  contentType!: string;

  /** Opaque version identifier (`DAV:getetag`), changed on every write. */
  @Column({ type: 'varchar' })
  etag!: string;

  /** Content size in bytes (`DAV:getcontentlength`). */
  @Column({ type: 'bigint', transformer: bigintColumnTransformer })
  sizeBytes!: number;

  /** Id of the principal that owns this file. */
  @Column({ type: 'uuid' })
  ownerPrincipalId!: string;

  /** The principal that owns this file. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'owner_principal_id' })
  ownerPrincipal!: Principal;

  /** Timestamp of file creation (`DAV:creationdate`). */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last write (`DAV:getlastmodified`). */
  @UpdateDateColumn()
  updatedAt!: Date;
}
