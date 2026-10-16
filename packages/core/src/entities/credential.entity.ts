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
import { User } from './user.entity.js';

/**
 * A credential's authentication mechanism: `'basic'` (argon2id password
 * hash), `'digest'` (stored RFC 7616 HA1, M10) or `'oauth2'` (a linked
 * external identity, M10).
 */
export type CredentialType = 'basic' | 'digest' | 'oauth2';

/** All valid {@link CredentialType} values. */
export const CREDENTIAL_TYPES: readonly CredentialType[] = [
  'basic',
  'digest',
  'oauth2',
];

/**
 * A single authentication credential for a {@link User}. A user may have
 * one credential per type (`basic`, `digest`, `oauth2`), but never two of
 * the same type — enforced by the unique `(userId, type)` index. Only the
 * columns belonging to a row's `type` are set; the rest stay `null`.
 *
 * The unique `(oauth2Issuer, oauth2Subject)` index guarantees an external
 * identity is linked to at most one local user (rows of other types have
 * both columns `null`, which the supported databases don't treat as
 * duplicates).
 */
@Entity('credentials')
@Index(['userId', 'type'], { unique: true })
@Index(['oauth2Issuer', 'oauth2Subject'], { unique: true })
export class Credential {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the user this credential authenticates. */
  @Column({ type: 'uuid' })
  userId!: string;

  /** The user this credential authenticates. */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** Which authentication mechanism this credential is for. */
  @Column({ type: 'simple-enum', enum: CREDENTIAL_TYPES })
  type!: CredentialType;

  /**
   * Bcrypt/argon2 password hash, set only when `type` is `'basic'`.
   * Never log this value.
   */
  @Column({ type: 'varchar', nullable: true })
  passwordHash!: string | null;

  /**
   * `HEX(SHA-256(username:realm:password))`, the RFC 7616 HA1 value, set
   * only when `type` is `'digest'`. Weaker than {@link passwordHash} (it
   * is password-equivalent for Digest auth, see planning/01-decisions.md
   * Runde 12). Never log this value.
   */
  @Column({ type: 'varchar', nullable: true })
  digestHa1!: string | null;

  /** The Digest realm {@link digestHa1} was computed for; set with it. */
  @Column({ type: 'varchar', nullable: true })
  digestRealm!: string | null;

  /** Issuer URL (`iss`) of the external identity, set only for `'oauth2'`. */
  @Column({ type: 'varchar', nullable: true })
  oauth2Issuer!: string | null;

  /** Subject (`sub`) of the external identity, set only for `'oauth2'`. */
  @Column({ type: 'varchar', nullable: true })
  oauth2Subject!: string | null;

  /** Timestamp of credential creation. */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last update to this credential (e.g. password change). */
  @UpdateDateColumn()
  updatedAt!: Date;
}
