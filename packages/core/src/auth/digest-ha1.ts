import { createHash } from 'node:crypto';

/**
 * Computes the RFC 7616 `H(username:realm:password)` value (`HA1`) with
 * SHA-256, the only algorithm DavNode's Digest support uses (M10, no
 * MD5), as lowercase hex. This is what `Credential.digestHa1` stores:
 * Digest verification needs it instead of a salted password hash, which
 * makes it password-equivalent — keep it out of logs and API responses.
 */
export function computeDigestHa1(
  username: string,
  realm: string,
  password: string,
): string {
  return createHash('sha256')
    .update(`${username}:${realm}:${password}`, 'utf8')
    .digest('hex');
}
