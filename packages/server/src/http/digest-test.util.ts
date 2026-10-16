import { createHash } from 'node:crypto';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** The parameters of a `WWW-Authenticate: Digest` challenge, parsed the way a client would. */
export function parseChallenge(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const match of header
    .replace(/^Digest\s+/i, '')
    .matchAll(/([a-z]+)=(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/gi)) {
    params[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  return params;
}

/** Builds the `Authorization: Digest ...` header a conforming RFC 7616 client (SHA-256, qop=auth) would send. */
export function digestAuthorization(options: {
  challenge: Record<string, string>;
  username: string;
  password: string;
  method: string;
  uri: string;
  nc?: number;
  cnonce?: string;
  /** Overrides the computed response, for negative tests. */
  response?: string;
}): string {
  const { challenge, username, password, method, uri } = options;
  const nc = (options.nc ?? 1).toString(16).padStart(8, '0');
  const cnonce = options.cnonce ?? 'cafebabe12345678';
  const ha1 = sha256(`${username}:${challenge['realm']}:${password}`);
  const ha2 = sha256(`${method}:${uri}`);
  const response =
    options.response ??
    sha256(`${ha1}:${challenge['nonce']}:${nc}:${cnonce}:auth:${ha2}`);
  return (
    `Digest username="${username}", realm="${challenge['realm']}", ` +
    `nonce="${challenge['nonce']}", uri="${uri}", algorithm=SHA-256, ` +
    `qop=auth, nc=${nc}, cnonce="${cnonce}", response="${response}", ` +
    `opaque="${challenge['opaque']}"`
  );
}
