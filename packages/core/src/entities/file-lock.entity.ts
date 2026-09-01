import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LOCK_SCOPE_VALUES, type LockScope } from './collection-lock.entity.js';
import { FileResource } from './file-resource.entity.js';
import { Principal } from './principal.entity.js';

/**
 * A WebDAV lock (RFC 4918 §7–9) held on a {@link FileResource} — the
 * object-level analog of {@link CollectionLock}. Has no `depth` field: a
 * single file has no descendants for a lock to cascade to.
 *
 * See {@link CollectionLock} for the shared field semantics (`token`
 * uniqueness, `scope`, `timeoutSeconds`/`expiresAt`, `ownerInfo`) and the
 * rationale for a dedicated per-domain-and-level table instead of a
 * generic/polymorphic lock table (same pattern as `CollectionAce`/`FileAce`,
 * M3).
 */
@Entity('file_locks')
export class FileLock {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the file this lock applies to. */
  @Column({ type: 'uuid' })
  fileResourceId!: string;

  /** The file this lock applies to. */
  @ManyToOne(() => FileResource)
  @JoinColumn({ name: 'file_resource_id' })
  fileResource!: FileResource;

  /** Id of the principal that holds this lock. */
  @Column({ type: 'uuid' })
  principalId!: string;

  /** The principal that holds this lock. */
  @ManyToOne(() => Principal)
  @JoinColumn({ name: 'principal_id' })
  principal!: Principal;

  /** Opaque lock token (`urn:uuid:<uuid>`), unique across all locks. */
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  token!: string;

  /** Whether this lock is exclusive or shared. */
  @Column({ type: 'simple-enum', enum: LOCK_SCOPE_VALUES })
  scope!: LockScope;

  /**
   * Requested/granted lock lifetime in seconds; `null` means `Infinite`
   * (RFC 4918 §10.7).
   */
  @Column({ type: 'int', nullable: true })
  timeoutSeconds!: number | null;

  /**
   * When this lock expires (`createdAt` + `timeoutSeconds`); `null` when
   * `timeoutSeconds` is `null` (`Infinite`).
   */
  @Column({ type: Date, nullable: true })
  expiresAt!: Date | null;

  /**
   * The client-supplied `<D:owner>` element from the LOCK request body
   * (RFC 4918 §14.17), stored raw and returned unchanged in
   * `lockdiscovery`. `null` when the client omitted it — `<D:owner>` is
   * optional in `<D:lockinfo>`.
   */
  @Column({ type: 'text', nullable: true })
  ownerInfo!: string | null;

  /** Timestamp this lock was created. */
  @CreateDateColumn()
  createdAt!: Date;
}
