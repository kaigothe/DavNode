import type { ColumnType } from 'typeorm';
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FileResource } from './file-resource.entity.js';

/**
 * Cross-driver column type for {@link FileContent.data}. Unlike `uuid`,
 * `bigint`, or `simple-enum`, there is no single abstract blob type
 * TypeORM normalizes per driver on its own: Postgres has no `blob` type
 * at all (only `bytea`), and MySQL's plain `blob` caps out at 64 KiB —
 * far too small for file storage, hence `longblob` — while SQLite's
 * `blob` has no comparable size cap. Resolved once from
 * `DAVNODE_DB_TYPE`, since a single process only ever targets one
 * database engine at a time (see planning/03-open-questions.md, "Blob-
 * Spaltentyp je DB-Engine").
 */
const BLOB_COLUMN_TYPE: ColumnType =
  process.env.DAVNODE_DB_TYPE === 'postgres'
    ? 'bytea'
    : process.env.DAVNODE_DB_TYPE === 'mysql'
      ? 'longblob'
      : 'blob';

/**
 * The binary content of a {@link FileResource}, split into its own table
 * (Runde 10) so PROPFIND/property queries never have to load large blobs
 * alongside metadata.
 */
@Entity('file_contents')
export class FileContent {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the file resource this content belongs to. */
  @Column({ type: 'uuid', unique: true })
  fileResourceId!: string;

  /**
   * The file resource this content belongs to. Deleting the resource
   * deletes its content too (`ON DELETE CASCADE`) — the two are always
   * created and deleted together at the service level (PUT/DELETE, see
   * the Resource-CRUD tasks), and content has no meaning on its own.
   */
  @OneToOne(() => FileResource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_resource_id' })
  fileResource!: FileResource;

  /** The raw file bytes. */
  @Column({ type: BLOB_COLUMN_TYPE })
  data!: Buffer;
}
