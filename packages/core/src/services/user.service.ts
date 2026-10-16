import { IsNull, type DataSource } from 'typeorm';
import { computeDigestHa1 } from '../auth/digest-ha1.js';
import { hashPassword } from '../auth/password-hashing.js';
import { Collection } from '../entities/collection.entity.js';
import { Credential } from '../entities/credential.entity.js';
import { Principal } from '../entities/principal.entity.js';
import { User, type UserRole } from '../entities/user.entity.js';
import { DuplicateEntryError, NotFoundError } from './errors.js';
import { isUniqueConstraintViolationError } from './unique-constraint.util.js';

/** Input for {@link UserService.createUser}. */
export interface CreateUserInput {
  tenantId: string;
  username: string;
  email: string;
  password: string;
  /** Defaults to `'member'` (the `User` entity's own column default). */
  role?: UserRole;
}

/** Input for {@link UserService.updateUserQuota}. */
export interface UpdateUserQuotaInput {
  quotaLimitBytes: number | null;
}

/** Input for {@link UserService.updateUser}; omitted fields stay unchanged. */
export interface UpdateUserInput {
  email?: string;
  quotaLimitBytes?: number | null;
  role?: UserRole;
}

/** Options for {@link UserService}. */
export interface UserServiceOptions {
  /**
   * The Digest realm. When set (i.e. Digest auth is enabled on the
   * server), `createUser` and `setUserPassword` also maintain a `digest`
   * credential holding `HA1 = SHA-256(username:realm:password)`; when
   * unset, no HA1 is ever stored.
   */
  digestRealm?: string;
}

/**
 * User management, backed directly by TypeORM repositories. Assumes the
 * tenant identified by `tenantId` already exists (created via
 * `TenantService` beforehand) — this service doesn't itself verify that,
 * since the `users.tenant_id` foreign key already prevents an orphaned
 * user from being persisted.
 */
export class UserService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly options: UserServiceOptions = {},
  ) {}

  /**
   * Creates a user in a single transaction: a `Principal` (`kind: 'user'`),
   * the `User` row referencing it, and a `basic` `Credential` holding the
   * password's argon2id hash (never the plaintext).
   *
   * @throws {@link DuplicateEntryError} If `username` is already in use
   * within `input.tenantId`.
   */
  async createUser(input: CreateUserInput): Promise<User> {
    const passwordHash = await hashPassword(input.password);

    return this.dataSource.transaction(async (manager) => {
      const principal = await manager.save(
        Principal,
        manager.create(Principal, {
          tenantId: input.tenantId,
          kind: 'user',
          specialKind: null,
        }),
      );

      let user: User;
      try {
        user = await manager.save(
          User,
          manager.create(User, {
            principalId: principal.id,
            tenantId: input.tenantId,
            username: input.username,
            email: input.email,
            role: input.role ?? 'member',
          }),
        );
      } catch (error) {
        if (isUniqueConstraintViolationError(error)) {
          throw new DuplicateEntryError(
            'username',
            `Username "${input.username}" is already in use in this tenant.`,
          );
        }
        throw error;
      }

      await manager.save(
        Credential,
        manager.create(Credential, {
          userId: user.id,
          type: 'basic',
          passwordHash,
        }),
      );
      if (this.options.digestRealm !== undefined) {
        await manager.save(
          Credential,
          manager.create(Credential, {
            userId: user.id,
            type: 'digest',
            digestHa1: computeDigestHa1(
              input.username,
              this.options.digestRealm,
              input.password,
            ),
            digestRealm: this.options.digestRealm,
          }),
        );
      }

      return user;
    });
  }

  /**
   * Looks up a user by username within a tenant (usernames are only
   * unique per tenant, not globally).
   *
   * @returns The user, or `null` if no user has that username in that
   * tenant.
   */
  async findUserByUsername(
    tenantId: string,
    username: string,
  ): Promise<User | null> {
    return this.dataSource.getRepository(User).findOneBy({
      tenantId,
      username,
    });
  }

  /**
   * Updates a user's storage quota limit.
   *
   * @throws {@link NotFoundError} If no user has `userId`.
   */
  async updateUserQuota(
    userId: string,
    input: UpdateUserQuotaInput,
  ): Promise<User> {
    const repository = this.dataSource.getRepository(User);
    const user = await repository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundError(`User "${userId}" not found.`);
    }
    user.quotaLimitBytes = input.quotaLimitBytes;
    return repository.save(user);
  }

  /** Lists every user of a tenant, ordered by username. */
  async listUsers(tenantId: string): Promise<User[]> {
    return this.dataSource
      .getRepository(User)
      .find({ where: { tenantId }, order: { username: 'ASC' } });
  }

  /**
   * Looks up a user by id within a tenant.
   *
   * @returns The user, or `null` if the tenant has no user with that id.
   */
  async findUserById(tenantId: string, userId: string): Promise<User | null> {
    return this.dataSource
      .getRepository(User)
      .findOneBy({ tenantId, id: userId });
  }

  /**
   * Whether `user` owns its tenant's WebDAV root collection — i.e. the
   * user who created it (the bootstrap admin). Deleting such a user
   * cascades away the whole tenant's file tree, so callers should
   * refuse to.
   */
  async ownsRootCollection(user: User): Promise<boolean> {
    return this.dataSource.getRepository(Collection).existsBy({
      tenantId: user.tenantId,
      parentCollectionId: IsNull(),
      ownerPrincipalId: user.principalId,
    });
  }

  /** Counts the users holding `role` across all tenants. */
  async countUsersWithRole(role: UserRole): Promise<number> {
    return this.dataSource.getRepository(User).countBy({ role });
  }

  /**
   * Updates a user's email, quota limit and/or role; fields left
   * `undefined` stay unchanged (a `null` `quotaLimitBytes` removes the
   * limit).
   *
   * @throws {@link NotFoundError} If no user has `userId`.
   */
  async updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    const repository = this.dataSource.getRepository(User);
    const user = await repository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundError(`User "${userId}" not found.`);
    }
    if (input.email !== undefined) {
      user.email = input.email;
    }
    if (input.quotaLimitBytes !== undefined) {
      user.quotaLimitBytes = input.quotaLimitBytes;
    }
    if (input.role !== undefined) {
      user.role = input.role;
    }
    return repository.save(user);
  }

  /**
   * Deletes a user by deleting its `Principal`: the database's
   * `ON DELETE CASCADE` foreign keys then remove the `User`, its
   * credentials, group memberships, ACEs and every resource it owns.
   * Quota counters are **not** adjusted by that cascade — callers must
   * run `recomputeQuotaForTenant` afterwards.
   *
   * @throws {@link NotFoundError} If no user has `userId`.
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.dataSource
      .getRepository(User)
      .findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundError(`User "${userId}" not found.`);
    }
    await this.dataSource
      .getRepository(Principal)
      .delete({ id: user.principalId });
  }

  /**
   * Sets a new password for an existing user, keeping every password
   * based credential consistent in one transaction: the `basic`
   * credential's argon2id hash is replaced (or created), and — if
   * Digest is enabled (`digestRealm`) — the `digest` credential's HA1
   * is recomputed. If Digest is *not* enabled, any `digest` credential
   * left over from an earlier configuration is deleted instead, since
   * its HA1 would still accept the old password. `oauth2` credentials
   * are not password based and stay untouched.
   *
   * @throws {@link NotFoundError} If no user has `userId`.
   */
  async setUserPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);

    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOneBy(User, { id: userId });
      if (!user) {
        throw new NotFoundError(`User "${userId}" not found.`);
      }

      const basic =
        (await manager.findOneBy(Credential, { userId, type: 'basic' })) ??
        manager.create(Credential, { userId, type: 'basic' });
      basic.passwordHash = passwordHash;
      await manager.save(Credential, basic);

      if (this.options.digestRealm === undefined) {
        await manager.delete(Credential, { userId, type: 'digest' });
        return;
      }
      const digest =
        (await manager.findOneBy(Credential, { userId, type: 'digest' })) ??
        manager.create(Credential, { userId, type: 'digest' });
      digest.digestRealm = this.options.digestRealm;
      digest.digestHa1 = computeDigestHa1(
        user.username,
        this.options.digestRealm,
        newPassword,
      );
      await manager.save(Credential, digest);
    });
  }

  /**
   * Links the external identity `(issuer, subject)` to a user by
   * creating its `oauth2` credential, so tokens of that identity
   * authenticate as the user (M10; there is no automatic provisioning).
   *
   * @throws {@link NotFoundError} If no user has `userId`.
   * @throws {@link DuplicateEntryError} If the user already has an
   * `oauth2` credential (unlink it first), or the identity is already
   * linked to a user.
   */
  async linkOAuth2Identity(
    userId: string,
    issuer: string,
    subject: string,
  ): Promise<void> {
    const credentials = this.dataSource.getRepository(Credential);
    if (!(await this.dataSource.getRepository(User).existsBy({ id: userId }))) {
      throw new NotFoundError(`User "${userId}" not found.`);
    }
    if (await credentials.existsBy({ userId, type: 'oauth2' })) {
      throw new DuplicateEntryError(
        'oauth2',
        'This user is already linked to an external identity; remove that link first.',
      );
    }
    try {
      await credentials.save(
        credentials.create({
          userId,
          type: 'oauth2',
          oauth2Issuer: issuer,
          oauth2Subject: subject,
        }),
      );
    } catch (error) {
      if (isUniqueConstraintViolationError(error)) {
        throw new DuplicateEntryError(
          'oauth2',
          'This external identity is already linked to a user.',
        );
      }
      throw error;
    }
  }

  /**
   * Removes a user's `oauth2` credential; their Basic and Digest
   * credentials are untouched.
   *
   * @returns Whether a link existed.
   */
  async unlinkOAuth2Identity(userId: string): Promise<boolean> {
    const result = await this.dataSource
      .getRepository(Credential)
      .delete({ userId, type: 'oauth2' });
    return (result.affected ?? 0) > 0;
  }
}
