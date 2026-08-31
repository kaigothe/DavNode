import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hashing.js';

describe('password hashing', () => {
  it('verifies the correct plaintext password against its hash', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(
      verifyPassword('correct horse battery staple', hash),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect plaintext password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('produces a different hash for the same password on each call (random salt)', async () => {
    const [first, second] = await Promise.all([
      hashPassword('correct horse battery staple'),
      hashPassword('correct horse battery staple'),
    ]);

    expect(first).not.toBe(second);
  });
});
