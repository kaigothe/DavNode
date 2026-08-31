import { argon2id, hash, verify } from 'argon2';

/**
 * Memory cost (in KiB) for argon2id password hashing. 19 MiB, the
 * OWASP Password Storage Cheat Sheet's recommended minimum for argon2id.
 */
const MEMORY_COST_KIB = 19_456;

/** Time cost (iteration count) for argon2id password hashing. */
const TIME_COST = 2;

/** Degree of parallelism for argon2id password hashing. */
const PARALLELISM = 1;

/**
 * Hashes a plaintext password with argon2id (the current OWASP
 * recommendation for new projects — more resistant to GPU and
 * side-channel attacks than bcrypt, with no legacy-compatibility reason
 * to prefer bcrypt here). A fresh random salt is generated for every
 * call, so hashing the same password twice produces different strings.
 *
 * @param plaintext - The password to hash. Never logged.
 * @returns A self-describing PHC-format hash string (algorithm, cost
 * parameters, salt, and digest), suitable for storing in
 * `Credential.passwordHash` and passing to {@link verifyPassword} later.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, {
    type: argon2id,
    memoryCost: MEMORY_COST_KIB,
    timeCost: TIME_COST,
    parallelism: PARALLELISM,
  });
}

/**
 * Verifies a plaintext password against a hash produced by
 * {@link hashPassword}.
 *
 * @param plaintext - The password to check. Never logged.
 * @param hash - The stored hash to check against. Never logged.
 * @returns `true` only if `plaintext` produces `hash` under the cost
 * parameters and salt encoded in `hash` itself.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return verify(hash, plaintext);
}
