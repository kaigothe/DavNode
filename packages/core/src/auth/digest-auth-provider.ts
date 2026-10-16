import { createHash, timingSafeEqual } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { Credential } from '../entities/credential.entity.js';
import { Principal } from '../entities/principal.entity.js';
import { Tenant } from '../entities/tenant.entity.js';
import { User } from '../entities/user.entity.js';
import type { AuthProvider } from './auth-provider.interface.js';
import { computeDigestHa1 } from './digest-ha1.js';

/** Credentials {@link DigestAuthProvider.verify} expects as `input`, already parsed from the `Authorization` header by the HTTP layer. */
interface DigestAuthCredentials {
  tenantSlug: string;
  username: string;
  realm: string;
  nonce: string;
  uri: string;
  method: string;
  qop: string;
  nc: string;
  cnonce: string;
  response: string;
}

const REQUIRED_FIELDS = [
  'tenantSlug',
  'username',
  'realm',
  'nonce',
  'uri',
  'method',
  'qop',
  'nc',
  'cnonce',
  'response',
] as const;

function isDigestAuthCredentials(
  input: unknown,
): input is DigestAuthCredentials {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  const record = input as Record<string, unknown>;
  return REQUIRED_FIELDS.every((field) => typeof record[field] === 'string');
}

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

// A syntactically valid HA1 that belongs to nobody, used so verify() does
// the same work when the tenant, user or credential doesn't exist.
const DUMMY_HA1 = computeDigestHa1(
  'timing-safety-dummy',
  'timing-safety-dummy',
  'timing-safety-dummy',
);

/**
 * The `'digest'` {@link AuthProvider} (RFC 7616, SHA-256 only): checks a
 * Digest `response` against the user's stored HA1. Pure cryptography —
 * no HTTP, and no nonce or replay handling, which is the HTTP layer's job
 * (`DigestNonceStore`) and happens *before* this is called.
 *
 * `verify` computes `SHA-256(HA1:nonce:nc:cnonce:qop:HA2)` with
 * `HA2 = SHA-256(method:uri)` and compares it in constant time. Only
 * `qop=auth` is supported.
 *
 * **Timing safety**: like the Basic provider, an unknown tenant, user or
 * missing digest credential runs the identical computation and
 * comparison against a dummy HA1, so "no such user" cannot be told from
 * "wrong response" by timing.
 */
export class DigestAuthProvider implements AuthProvider {
  readonly type = 'digest';

  /** @param dataSource - An initialized DataSource to read Tenant, User, Credential and Principal rows from. */
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Verifies a parsed Digest `Authorization` header.
   *
   * @param input - Expected to carry the string fields `tenantSlug`,
   * `username`, `realm`, `nonce`, `uri`, `method`, `qop`, `nc`, `cnonce`
   * and `response`; `null` is returned if it isn't shaped that way.
   * @returns The authenticated user's principal, or `null` if the
   * user or digest credential doesn't exist, `qop` isn't `auth`, or the
   * `response` is wrong.
   */
  async verify(input: unknown): Promise<Principal | null> {
    if (!isDigestAuthCredentials(input)) {
      return null;
    }
    const { tenantSlug, username, nonce, uri, method, qop, nc, cnonce } = input;

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
          .findOneBy({ userId: user.id, type: 'digest' })
      : null;

    const ha1 = credential?.digestHa1 ?? DUMMY_HA1;
    const ha2 = sha256Hex(`${method}:${uri}`);
    const expected = Buffer.from(
      sha256Hex(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`),
      'utf8',
    );
    const received = Buffer.from(input.response.toLowerCase(), 'utf8');
    const responseMatches =
      received.length === expected.length &&
      timingSafeEqual(received, expected);

    if (!user || !credential || qop !== 'auth' || !responseMatches) {
      return null;
    }
    return this.dataSource
      .getRepository(Principal)
      .findOneBy({ id: user.principalId });
  }
}
