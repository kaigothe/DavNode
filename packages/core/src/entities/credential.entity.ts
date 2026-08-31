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
 * A credential's authentication mechanism. Only `'basic'` is valid in M1;
 * modeled as a string enum (rather than a single literal type) so
 * `'digest'`/`'oauth2'` can be added in M10 without a column type change.
 */
export type CredentialType = 'basic';

/** All valid {@link CredentialType} values. */
export const CREDENTIAL_TYPES: readonly CredentialType[] = ['basic'];

/**
 * A single authentication credential for a {@link User}. A user may have
 * multiple credentials of different types (one `basic` and, from M10
 * onward, one `digest` and/or one `oauth2`), but never two of the same
 * type — enforced by the unique `(userId, type)` index.
 *
 * Only the `basic` type is populated in M1; digest- and OAuth2-specific
 * columns are added in M10 alongside their respective auth providers,
 * rather than carrying unused columns until then.
 */
@Entity('credentials')
@Index(['userId', 'type'], { unique: true })
export class Credential {
  /** Primary key. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id of the user this credential authenticates. */
  @Column({ type: 'uuid' })
  userId!: string;

  /** The user this credential authenticates. */
  @ManyToOne(() => User)
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

  /** Timestamp of credential creation. */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last update to this credential (e.g. password change). */
  @UpdateDateColumn()
  updatedAt!: Date;
}
