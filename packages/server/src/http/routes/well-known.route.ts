import {
  BasicAuthProvider,
  Tenant,
  toPrincipalUrl,
  type DataSource,
} from '@davnode/core';
import type { Express, Request, Response } from 'express';
import { parseBasicAuthHeader } from '../basic-auth.middleware.js';

/** Options for {@link registerWellKnownRoute}. */
export interface WellKnownRouteOptions {
  /**
   * The tenant used when `DAVNODE_DEFAULT_TENANT` is set (typical for a
   * single organization): the Basic username is then looked up directly
   * in this tenant. Without it the username must read
   * `user@tenantSlug`.
   */
  defaultTenant?: string;
  /** Realm of the Basic challenge. Defaults to `'davnode'`. */
  realm?: string;
}

/**
 * Registers `/.well-known/caldav` and `/.well-known/carddav`
 * (RFC 6764 service discovery; M11,
 * milestones/M11-client-compatibility/01-well-known-discovery). Clients
 * that only know the server's address and the user's credentials request
 * one of these and follow the redirect.
 *
 * These paths sit outside `/dav/{tenantSlug}`, so the normal tenant
 * resolution cannot run (planning/01-decisions.md, Runde 26). Instead the
 * tenant comes from `defaultTenant` or from the username's
 * `user@tenantSlug` form (split at the *last* `@`, so usernames that are
 * e-mail addresses keep working in default-tenant mode and can be
 * written `mail@example.com@tenant` otherwise). Authentication is
 * always HTTP Basic here, whatever other schemes the server offers.
 *
 * Responses: `401` with a Basic challenge for missing credentials and —
 * indistinguishably — for an unknown tenant, unknown user or wrong
 * password; `400` for credentials without a tenant when no default is
 * configured; otherwise `302` to the user's principal URL, from which the
 * client reads `calendar-home-set`/`addressbook-home-set` itself (RFC
 * 6764 §6). `caldav` and `carddav` redirect to the same URL.
 */
export function registerWellKnownRoute(
  app: Express,
  dataSource: DataSource,
  options: WellKnownRouteOptions = {},
): void {
  const provider = new BasicAuthProvider(dataSource);
  const realm = options.realm ?? 'davnode';

  const unauthorized = (res: Response): void => {
    res.set('WWW-Authenticate', `Basic realm="${realm}"`);
    res.sendStatus(401);
  };

  const handler = async (req: Request, res: Response): Promise<void> => {
    const credentials = parseBasicAuthHeader(req.header('Authorization'));
    if (!credentials) {
      unauthorized(res);
      return;
    }

    let tenantSlug: string;
    let username: string;
    if (options.defaultTenant) {
      tenantSlug = options.defaultTenant;
      username = credentials.username;
    } else {
      const at = credentials.username.lastIndexOf('@');
      if (at === -1) {
        res
          .status(400)
          .type('text/plain')
          .send('Without a default tenant, log in as "username@tenant".\n');
        return;
      }
      username = credentials.username.slice(0, at);
      tenantSlug = credentials.username.slice(at + 1);
    }

    const principal = await provider.verify({
      tenantSlug,
      username,
      password: credentials.password,
    });
    const tenant = principal
      ? await dataSource.getRepository(Tenant).findOneBy({ slug: tenantSlug })
      : null;
    if (!principal || !tenant) {
      unauthorized(res);
      return;
    }

    res.redirect(302, toPrincipalUrl(principal, tenant));
  };

  for (const path of ['/.well-known/caldav', '/.well-known/carddav']) {
    app.get(path, handler);
    app.propfind(path, handler);
  }
}
