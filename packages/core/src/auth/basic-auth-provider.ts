import type { DataSource } from 'typeorm';
import { Credential } from '../entities/credential.entity.js';
import { Principal } from '../entities/principal.entity.js';
import { Tenant } from '../entities/tenant.entity.js';
import { User } from '../entities/user.entity.js';
import type { AuthProvider } from './auth-provider.interface.js';
import { hashPassword, verifyPassword } from './password-hashing.js';

/** Credentials {@link BasicAuthProvider.verify} expects as `input`. */
interface BasicAuthCredentials {
  tenantSlug: string;
  username: string;
  password: string;
}

function isBasicAuthCredentials(input: unknown): input is BasicAuthCredentials {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  const record = input as Record<string, unknown>;
  return (
    typeof record.tenantSlug === 'string' &&
    typeof record.username === 'string' &&
    typeof record.password === 'string'
  );
}

// Computed once at module load, using the same cost parameters as real
// credentials, so verify() has a real hash to check the password against
// even when the tenant, user, or `basic` credential doesn't exist — see
// the class-level note on timing safety.
const DUMMY_HASH = await hashPassword('timing-safety-dummy-password');

/**
 * The `'basic'` {@link AuthProvider}: verifies a username/password pair
 * against the user's stored `basic` {@link Credential} within a tenant
 * (resolved by `tenantSlug`, since usernames are only unique per tenant).
 *
 * Works directly against TypeORM repositories rather than a
 * repository/service layer, since that layer doesn't exist yet at this
 * point in M1 — see the Basic-Auth-Provider sub-task.
 *
 * **Timing safety**: `verify` always runs exactly one password-hash
 * comparison, against a precomputed dummy hash when the tenant, user, or
 * credential doesn't exist. Without this, an attacker could distinguish
 * "unknown user" from "wrong password" by measuring response time, since
 * a real comparison (argon2id) takes far longer than a database miss.
 */
export class BasicAuthProvider implements AuthProvider {
  readonly type = 'basic';

  /**
   * @param dataSource - An initialized DataSource to read Tenant, User,
   * Credential, and Principal rows from.
   */
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Verifies a `{ tenantSlug, username, password }` credential.
   *
   * @param input - Expected to be `{ tenantSlug, username, password }`;
   * returns `null` immediately if it isn't shaped that way.
   * @returns The authenticated user's principal, or `null` if the
   * tenant/user/credential doesn't exist or the password is wrong.
   */
  async verify(input: unknown): Promise<Principal | null> {
    if (!isBasicAuthCredentials(input)) {
      return null;
    }
    const { tenantSlug, username, password } = input;

    const tenant = await this.dataSource
      .getRepository(Tenant)
      .findOneBy({ slug: tenantSlug });
    const user = tenant
      ? await this.dataSource
          .getRepository(User)
          .findOneBy({ tenantId: tenant.id, username })
      : null;
    const credential = user
      ? await this.dataSource
          .getRepository(Credential)
          .findOneBy({ userId: user.id, type: 'basic' })
      : null;

    const passwordMatches = await verifyPassword(
      password,
      credential?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !credential || !passwordMatches) {
      return null;
    }

    return this.dataSource
      .getRepository(Principal)
      .findOneBy({ id: user.principalId });
  }
}
