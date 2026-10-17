import {
  AuthProviderRegistry,
  BasicAuthProvider,
  type DataSource,
} from '@davnode/core';
import type { RequestHandler } from 'express';
import { appendChallenge } from './auth-chain.js';
import type { AuthObserver } from './auth-observer.js';

/** Default HTTP Basic realm, used when {@link BasicAuthMiddlewareOptions.realm} isn't set. */
const DEFAULT_REALM = 'davnode';

/** Options for {@link createBasicAuthMiddleware}. */
export interface BasicAuthMiddlewareOptions {
  /** Sent in the `WWW-Authenticate` challenge. Defaults to `'davnode'`. */
  realm?: string;
  /**
   * Chained mode (see `auth-chain.ts`): instead of answering `401`
   * itself, record the Basic challenge and call `next()` so another
   * scheme can try, leaving the final `401` to the chain's terminator.
   * Default `false`: the middleware answers `401` itself, as in M2.
   */
  chained?: boolean;
  /** Told about every credential check, see {@link AuthObserver}. */
  observer?: AuthObserver;
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
export function parseBasicAuthHeader(
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

    if (options.chained && req.principal) {
      next();
      return;
    }
    const deny = (): void => {
      if (options.chained) {
        appendChallenge(res, `Basic realm="${realm}"`);
        next();
        return;
      }
      res.set('WWW-Authenticate', `Basic realm="${realm}"`);
      res.sendStatus(401);
    };

    const credentials = parseBasicAuthHeader(req.header('Authorization'));
    if (!credentials) {
      deny();
      return;
    }

    const principal = await provider.verify({
      tenantSlug: req.tenant.slug,
      username: credentials.username,
      password: credentials.password,
    });
    if (!principal) {
      options.observer?.failure(req, 'basic');
      deny();
      return;
    }

    options.observer?.success(req);
    req.principal = principal;
    next();
  };
}
