import type { DataSource } from 'typeorm';
import { hashPassword } from '../auth/password-hashing.js';
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

/**
 * User management, backed directly by TypeORM repositories. Assumes the
 * tenant identified by `tenantId` already exists (created via
 * `TenantService` beforehand) — this service doesn't itself verify that,
 * since the `users.tenant_id` foreign key already prevents an orphaned
 * user from being persisted.
 */
export class UserService {
  constructor(private readonly dataSource: DataSource) {}

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
}
