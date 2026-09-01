import {
  AuthProviderRegistry,
  BasicAuthProvider,
  type DataSource,
} from '@davnode/core';
import type { RequestHandler } from 'express';

/** Default HTTP Basic realm, used when {@link BasicAuthMiddlewareOptions.realm} isn't set. */
const DEFAULT_REALM = 'davnode';

/** Options for {@link createBasicAuthMiddleware}. */
export interface BasicAuthMiddlewareOptions {
  /** Sent in the `WWW-Authenticate` challenge. Defaults to `'davnode'`. */
  realm?: string;
}

interface BasicCredentials {
  username: string;
  password: string;
}

/**
 * Parses an `Authorization: Basic base64(username:password)` header.
 * Never logs or otherwise surfaces the decoded value beyond returning it
 * to the caller.
 *
 * @returns The decoded `{ username, password }`, or `null` if `header`
 * is missing, isn't the `Basic` scheme, or doesn't decode to a
 * `username:password` pair.
 */
function parseBasicAuthHeader(
  header: string | undefined,
): BasicCredentials | null {
  if (!header) {
    return null;
  }
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (!match) {
    return null;
  }

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

/**
 * Creates the HTTP-side half of Basic Auth: parses the `Authorization`
 * header and calls the HTTP-independent `BasicAuthProvider` (`core`,
 * M1) to verify the credentials, per the auth-interface split in
 * planning/04-architecture.md. Registers the provider into a fresh
 * {@link AuthProviderRegistry}, so adding further schemes later (M10)
 * only means registering more providers here, not restructuring this
 * middleware.
 *
 * A missing/malformed header or failed verification both respond
 * `401 Unauthorized` with a `WWW-Authenticate: Basic realm="..."`
 * header — indistinguishable from each other, and (via
 * `BasicAuthProvider`'s own timing-safe design) indistinguishable
 * between "wrong password" and "user doesn't exist". On success, the
 * authenticated principal is attached as `req.principal` (see
 * `express.d.ts` for the type augmentation).
 *
 * Must run after the tenant-resolution middleware, since verification
 * needs `req.tenant` (usernames are only unique per tenant).
 *
 * @param dataSource - An initialized DataSource, passed to `BasicAuthProvider`.
 * @param options - See {@link BasicAuthMiddlewareOptions}.
 * @throws An `Error` if `req.tenant` isn't set when a request reaches
 * this middleware — a misconfiguration (wrong mounting order), not a
 * client-facing condition.
 */
export function createBasicAuthMiddleware(
  dataSource: DataSource,
  options: BasicAuthMiddlewareOptions = {},
): RequestHandler {
  const realm = options.realm ?? DEFAULT_REALM;
  const registry = new AuthProviderRegistry();
  registry.register(new BasicAuthProvider(dataSource));
  const provider = registry.resolve('basic');
  if (!provider) {
    // Unreachable: registered on the line above. Guards the lookup for
    // TypeScript, which can't know resolve() will find what register()
    // just added.
    throw new Error('basic auth provider failed to register');
  }

  return async (req, res, next): Promise<void> => {
    if (!req.tenant) {
      throw new Error(
        'basic-auth middleware requires the tenant-resolution middleware to run first (req.tenant is not set)',
      );
    }

    const credentials = parseBasicAuthHeader(req.header('Authorization'));
    if (!credentials) {
      res.set('WWW-Authenticate', `Basic realm="${realm}"`);
      res.sendStatus(401);
      return;
    }

    const principal = await provider.verify({
      tenantSlug: req.tenant.slug,
      username: credentials.username,
      password: credentials.password,
    });
    if (!principal) {
      res.set('WWW-Authenticate', `Basic realm="${realm}"`);
      res.sendStatus(401);
      return;
    }

    req.principal = principal;
    next();
  };
}
