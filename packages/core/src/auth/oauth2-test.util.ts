import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWK,
} from 'jose';

/** A throwaway signing key pair plus its public JWK, for OAuth2 tests. */
export interface TestSigningKey {
  kid: string;
  alg: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

/** Generates a key pair for `alg` (default `RS256`) published under `kid`. */
export async function createTestSigningKey(
  kid: string,
  alg = 'RS256',
): Promise<TestSigningKey> {
  const { privateKey, publicKey } = await generateKeyPair(alg, {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  return {
    kid,
    alg,
    privateKey,
    publicJwk: { ...publicJwk, kid, alg, use: 'sig' },
  };
}

/** The JWKS document an issuer would publish for `keys`. */
export const jwksBody = (...keys: TestSigningKey[]): { keys: JWK[] } => ({
  keys: keys.map((key) => key.publicJwk),
});

/** Signs a JWT; claims default to a valid token and can be overridden or removed (set to `undefined`). */
export async function signTestToken(
  key: TestSigningKey,
  claims: {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number | undefined;
    nbf?: number;
  } = {},
  header: { alg?: string; kid?: string | undefined } = {},
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({})
    .setProtectedHeader({
      alg: header.alg ?? key.alg,
      ...('kid' in header ? { kid: header.kid } : { kid: key.kid }),
    })
    .setIssuer(claims.iss ?? 'https://idp.example.com')
    .setAudience(claims.aud ?? 'davnode')
    .setSubject(claims.sub ?? 'subject-1')
    .setIssuedAt(nowSeconds);
  if (!('exp' in claims)) {
    jwt.setExpirationTime(nowSeconds + 300);
  } else if (claims.exp !== undefined) {
    jwt.setExpirationTime(claims.exp);
  }
  if (claims.nbf !== undefined) {
    jwt.setNotBefore(claims.nbf);
  }
  return jwt.sign(key.privateKey);
}

/** An unsigned (`alg: none`) token with the given claims — what a forger would send. */
export function unsignedToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`;
}

/** A token "signed" with HMAC-SHA256 using `secret` (e.g. the issuer's public key text), as in the classic algorithm-confusion attack. */
export async function hmacToken(
  secret: string,
  kid: string,
  claims: { iss: string; aud: string; sub: string },
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', kid })
    .setIssuer(claims.iss)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setExpirationTime(nowSeconds + 300)
    .sign(new TextEncoder().encode(secret));
}
