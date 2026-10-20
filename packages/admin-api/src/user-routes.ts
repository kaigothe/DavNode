import {
  recomputeQuotaForTenant,
  USER_ROLES,
  UserService,
  type DataSource,
  User,
  type UserRole,
} from '@davnode/core';
import type { Request, Response, Router } from 'express';
import { sendAdminError } from './admin-error-response.js';
import { requirePrincipal, requireTenant } from './admin-request.util.js';
import { paginate, parseListQuery } from './pagination.util.js';
import {
  isNonEmptyString,
  isQuotaLimit,
  parseJsonBody,
} from './request-body.util.js';
import { requireAdminRole } from './require-admin-role.middleware.js';
import type { AdminRouterOptions } from './router.js';

/**
 * The JSON representation of a user in Admin API responses. Credentials
 * (`password_hash` and friends) live in their own table and are never
 * part of it.
 */
function toUserBody(user: User) {
  return {
    id: user.id,
    /** Id of the user's principal, which forms the DAV URLs `/dav/{tenant}/principals/users/{principalId}`, `/calendars/{principalId}` and `/addressbooks/{principalId}`. */
    principalId: user.principalId,
    username: user.username,
    email: user.email,
    role: user.role,
    quotaLimitBytes: user.quotaLimitBytes,
    quotaUsedBytes: user.quotaUsedBytes,
    createdAt: user.createdAt.toISOString(),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_USERNAME_LENGTH = 255;

/**
 * Usernames travel in HTTP Basic credentials (`user:password`), so a
 * colon would make them unparseable; path separators and control
 * characters are rejected for the same "ends up in a URL/header" reason.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_USERNAME_CHARS = /[:/\\\u0000-\u001f\u007f]/;

const isUsername = (value: unknown): value is string =>
  isNonEmptyString(value) &&
  value.length <= MAX_USERNAME_LENGTH &&
  value === value.trim() &&
  !FORBIDDEN_USERNAME_CHARS.test(value);

const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+$/.test(value);

const isRole = (value: unknown): value is UserRole =>
  typeof value === 'string' &&
  (USER_ROLES as readonly string[]).includes(value);

/**
 * Registers the user-management routes (M9 Große Aufgabe 4) on the
 * Admin API router. `{tenantSlug}` is the tenant being managed; both
 * `tenant_admin` (own tenant only) and `server_admin` may call them
 * (`requireAdminRole`).
 *
 * Privilege-escalation rules, enforced on top of the role check:
 * only a `server_admin` may grant `server_admin`, and a `tenant_admin`
 * may not modify or delete an existing `server_admin` user either.
 * Neither deleting nor demoting the instance's last `server_admin` is
 * allowed (`409`), a safety net against locking everyone out.
 */
export function registerUserRoutes(
  router: Router,
  dataSource: DataSource,
  options: AdminRouterOptions = {},
): void {
  const users = new UserService(dataSource, {
    digestRealm: options.digestRealm,
  });
  const tenantAdmin = requireAdminRole(dataSource, 'tenant_admin');

  const invalid = (res: Response, code: string, message: string) =>
    sendAdminError(res, 400, code, message);

  /** The authenticated requester's own `User` row. */
  async function loadRequester(req: Request): Promise<User> {
    return dataSource
      .getRepository(User)
      .findOneByOrFail({ principalId: requirePrincipal(req).id });
  }

  /** Loads the `{userId}` target inside the managed tenant, answering 404 itself when absent. */
  async function loadTarget(req: Request, res: Response): Promise<User | null> {
    const userId = String(req.params['userId']);
    const target = UUID_PATTERN.test(userId)
      ? await users.findUserById(requireTenant(req).id, userId)
      : null;
    if (!target) {
      sendAdminError(res, 404, 'user_not_found', 'User not found.');
    }
    return target;
  }

  const forbidEscalation = (res: Response) =>
    sendAdminError(
      res,
      403,
      'role_escalation',
      'Only a server_admin may grant or modify the server_admin role.',
    );

  router.post('/users', tenantAdmin, parseJsonBody, async (req, res) => {
    const { username, email, password, role } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    if (!isUsername(username)) {
      invalid(
        res,
        'invalid_username',
        '"username" must be a non-empty string without ":", "/", "\\" or control characters.',
      );
      return;
    }
    if (!isEmail(email)) {
      invalid(res, 'invalid_email', '"email" must be an email address.');
      return;
    }
    if (!isNonEmptyString(password)) {
      invalid(
        res,
        'invalid_password',
        '"password" must be a non-empty string.',
      );
      return;
    }
    if (role !== undefined && !isRole(role)) {
      invalid(
        res,
        'invalid_role',
        `"role" must be one of ${USER_ROLES.join(', ')}.`,
      );
      return;
    }
    if (
      role === 'server_admin' &&
      (await loadRequester(req)).role !== 'server_admin'
    ) {
      forbidEscalation(res);
      return;
    }

    const user = await users.createUser({
      tenantId: requireTenant(req).id,
      username,
      email,
      password,
      role,
    });
    res.status(201).json(toUserBody(user));
  });

  router.get('/users', tenantAdmin, async (req, res) => {
    const query = parseListQuery(req, res);
    if (!query) {
      return;
    }
    const { items, total } = paginate(
      await users.listUsers(requireTenant(req).id),
      query,
      (user) => [user.username, user.email],
    );
    res.json({ users: items.map(toUserBody), total });
  });

  router.get('/users/:userId', tenantAdmin, async (req, res) => {
    const target = await loadTarget(req, res);
    if (target) {
      res.json(toUserBody(target));
    }
  });

  router.patch(
    '/users/:userId',
    tenantAdmin,
    parseJsonBody,
    async (req, res) => {
      const { email, quotaLimitBytes, role } = (req.body ?? {}) as Record<
        string,
        unknown
      >;
      if (email !== undefined && !isEmail(email)) {
        invalid(res, 'invalid_email', '"email" must be an email address.');
        return;
      }
      if (quotaLimitBytes !== undefined && !isQuotaLimit(quotaLimitBytes)) {
        invalid(
          res,
          'invalid_quota',
          '"quotaLimitBytes" must be null or a non-negative integer.',
        );
        return;
      }
      if (role !== undefined && !isRole(role)) {
        invalid(
          res,
          'invalid_role',
          `"role" must be one of ${USER_ROLES.join(', ')}.`,
        );
        return;
      }

      const target = await loadTarget(req, res);
      if (!target) {
        return;
      }
      const requester = await loadRequester(req);
      if (
        requester.role !== 'server_admin' &&
        (role === 'server_admin' || target.role === 'server_admin')
      ) {
        forbidEscalation(res);
        return;
      }
      if (
        role !== undefined &&
        role !== 'server_admin' &&
        target.role === 'server_admin' &&
        (await users.countUsersWithRole('server_admin')) <= 1
      ) {
        sendAdminError(
          res,
          409,
          'last_server_admin',
          'The last server_admin of the instance cannot be demoted.',
        );
        return;
      }

      const updated = await users.updateUser(target.id, {
        email,
        quotaLimitBytes,
        role,
      });
      res.json(toUserBody(updated));
    },
  );

  router.delete(
    '/users/:userId',
    tenantAdmin,
    parseJsonBody,
    async (req, res) => {
      const target = await loadTarget(req, res);
      if (!target) {
        return;
      }
      const confirmUsername = (
        req.body as { confirmUsername?: unknown } | undefined
      )?.confirmUsername;
      if (confirmUsername !== target.username) {
        invalid(
          res,
          'confirmation_mismatch',
          'The request body must contain a "confirmUsername" equal to the username of the user to delete.',
        );
        return;
      }
      if (
        target.role === 'server_admin' &&
        (await loadRequester(req)).role !== 'server_admin'
      ) {
        forbidEscalation(res);
        return;
      }
      if (
        target.role === 'server_admin' &&
        (await users.countUsersWithRole('server_admin')) <= 1
      ) {
        sendAdminError(
          res,
          409,
          'last_server_admin',
          'The last server_admin of the instance cannot be deleted.',
        );
        return;
      }

      // The tenant's WebDAV root collection belongs to the user who
      // created it; deleting that user would cascade away every other
      // user's files too.
      const ownsRoot = await users.ownsRootCollection(target);
      if (ownsRoot) {
        sendAdminError(
          res,
          409,
          'owns_root_collection',
          "The user owns the tenant's root collection; deleting them would delete every user's files.",
        );
        return;
      }

      await users.deleteUser(target.id);
      // The cascade bypasses applyQuotaDelta: bring the counters back in
      // line right away rather than waiting for the reconciliation job.
      await recomputeQuotaForTenant(dataSource, requireTenant(req).id);
      res.status(204).end();
    },
  );

  router.post(
    '/users/:userId/password',
    tenantAdmin,
    parseJsonBody,
    async (req, res) => {
      const password = (req.body as { password?: unknown } | undefined)
        ?.password;
      if (!isNonEmptyString(password)) {
        invalid(
          res,
          'invalid_password',
          '"password" must be a non-empty string.',
        );
        return;
      }

      const target = await loadTarget(req, res);
      if (!target) {
        return;
      }
      // Resetting a server_admin's password would be a takeover of that
      // account, so it is held to the same rule as modifying one.
      if (
        target.role === 'server_admin' &&
        (await loadRequester(req)).role !== 'server_admin'
      ) {
        forbidEscalation(res);
        return;
      }

      await users.setUserPassword(target.id, password);
      res.status(204).end();
    },
  );

  router.post(
    '/users/:userId/oauth2-link',
    tenantAdmin,
    parseJsonBody,
    async (req, res) => {
      const { issuer, subject } = (req.body ?? {}) as Record<string, unknown>;
      if (!isNonEmptyString(issuer) || !isNonEmptyString(subject)) {
        invalid(
          res,
          'invalid_identity',
          '"issuer" and "subject" must be non-empty strings.',
        );
        return;
      }
      if (!options.oauth2Issuers?.includes(issuer)) {
        invalid(
          res,
          'unknown_issuer',
          '"issuer" is not one of the issuers this server trusts.',
        );
        return;
      }

      const target = await loadTarget(req, res);
      if (!target) {
        return;
      }
      // Linking an identity to a server_admin's account would let whoever
      // controls that identity act as the admin.
      if (
        target.role === 'server_admin' &&
        (await loadRequester(req)).role !== 'server_admin'
      ) {
        forbidEscalation(res);
        return;
      }

      // A conflict surfaces as DuplicateEntryError and is mapped to 409
      // by adminErrorHandler.
      await users.linkOAuth2Identity(target.id, issuer, subject);
      res.status(201).json({ issuer, subject });
    },
  );

  router.delete('/users/:userId/oauth2-link', tenantAdmin, async (req, res) => {
    const target = await loadTarget(req, res);
    if (!target) {
      return;
    }
    if (
      target.role === 'server_admin' &&
      (await loadRequester(req)).role !== 'server_admin'
    ) {
      forbidEscalation(res);
      return;
    }
    if (!(await users.unlinkOAuth2Identity(target.id))) {
      sendAdminError(
        res,
        404,
        'not_linked',
        'The user has no linked identity.',
      );
      return;
    }
    res.status(204).end();
  });
}
