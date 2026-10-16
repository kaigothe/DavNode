import {
  GroupMembershipService,
  GroupService,
  Principal,
  type DataSource,
  type Group,
} from '@davnode/core';
import type { Request, Response, Router } from 'express';
import { sendAdminError } from './admin-error-response.js';
import { requireTenant } from './admin-request.util.js';
import { isNonEmptyString, parseJsonBody } from './request-body.util.js';
import { requireAdminRole } from './require-admin-role.middleware.js';

/** The JSON representation of a group in Admin API responses. */
function toGroupBody(group: Group) {
  return {
    id: group.id,
    principalId: group.principalId,
    name: group.name,
    description: group.description,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Registers the group-management routes (M9 Große Aufgabe 5) on the
 * Admin API router: group CRUD plus membership endpoints. A thin REST
 * layer over `GroupService`/`GroupMembershipService`; open to
 * `tenant_admin` (own tenant) and `server_admin`. Everything is scoped to
 * `{tenantSlug}`: a group or principal of another tenant is reported as
 * not found, never touched.
 */
export function registerGroupRoutes(
  router: Router,
  dataSource: DataSource,
): void {
  const groups = new GroupService(dataSource);
  const memberships = new GroupMembershipService(dataSource);
  const tenantAdmin = requireAdminRole(dataSource, 'tenant_admin');

  /** Loads the `{groupId}` target inside the managed tenant, answering 404 itself when absent. */
  async function loadGroup(req: Request, res: Response): Promise<Group | null> {
    const groupId = String(req.params['groupId']);
    const group = UUID_PATTERN.test(groupId)
      ? await groups.findGroupById(requireTenant(req).id, groupId)
      : null;
    if (!group) {
      sendAdminError(res, 404, 'group_not_found', 'Group not found.');
    }
    return group;
  }

  router.post('/groups', tenantAdmin, parseJsonBody, async (req, res) => {
    const { name, description } = (req.body ?? {}) as Record<string, unknown>;
    if (!isNonEmptyString(name)) {
      sendAdminError(
        res,
        400,
        'invalid_name',
        '"name" must be a non-empty string.',
      );
      return;
    }
    if (
      description !== undefined &&
      description !== null &&
      typeof description !== 'string'
    ) {
      sendAdminError(
        res,
        400,
        'invalid_description',
        '"description" must be a string or null.',
      );
      return;
    }

    const group = await groups.createGroup({
      tenantId: requireTenant(req).id,
      name,
      description,
    });
    res.status(201).json(toGroupBody(group));
  });

  router.get('/groups', tenantAdmin, async (req, res) => {
    const all = await groups.listGroups(requireTenant(req).id);
    res.json({ groups: all.map(toGroupBody) });
  });

  router.get('/groups/:groupId', tenantAdmin, async (req, res) => {
    const group = await loadGroup(req, res);
    if (group) {
      res.json(toGroupBody(group));
    }
  });

  router.delete('/groups/:groupId', tenantAdmin, async (req, res) => {
    const group = await loadGroup(req, res);
    if (!group) {
      return;
    }
    await groups.deleteGroup(group.id);
    res.status(204).end();
  });

  router.get('/groups/:groupId/members', tenantAdmin, async (req, res) => {
    const group = await loadGroup(req, res);
    if (!group) {
      return;
    }
    const members = await memberships.listDirectMembers(group.id);
    res.json({ members: await memberships.describePrincipals(members) });
  });

  // Registered next to its sibling; no clash with the `:principalId`
  // route below, which only answers DELETE.
  router.get(
    '/groups/:groupId/members/effective',
    tenantAdmin,
    async (req, res) => {
      const group = await loadGroup(req, res);
      if (!group) {
        return;
      }
      const members = await memberships.resolveEffectiveMembers(group.id);
      members.sort((a, b) => a.id.localeCompare(b.id));
      res.json({ members: await memberships.describePrincipals(members) });
    },
  );

  router.post(
    '/groups/:groupId/members',
    tenantAdmin,
    parseJsonBody,
    async (req, res) => {
      const group = await loadGroup(req, res);
      if (!group) {
        return;
      }
      const principalId = (req.body as { principalId?: unknown } | undefined)
        ?.principalId;
      if (typeof principalId !== 'string' || !UUID_PATTERN.test(principalId)) {
        sendAdminError(
          res,
          400,
          'invalid_principal_id',
          '"principalId" must be the id of a user or group principal.',
        );
        return;
      }
      const principal = await dataSource
        .getRepository(Principal)
        .findOneBy({ id: principalId, tenantId: group.tenantId });
      if (!principal) {
        sendAdminError(res, 404, 'principal_not_found', 'Principal not found.');
        return;
      }
      if (principal.kind === 'special') {
        sendAdminError(
          res,
          400,
          'invalid_member_kind',
          'Only user and group principals can be group members.',
        );
        return;
      }

      // Cycles and duplicates surface as CycleDetectedError /
      // DuplicateEntryError and are mapped to 409 by adminErrorHandler.
      await memberships.addMember(group.id, principal.id);
      res.status(204).end();
    },
  );

  router.delete(
    '/groups/:groupId/members/:principalId',
    tenantAdmin,
    async (req, res) => {
      const group = await loadGroup(req, res);
      if (!group) {
        return;
      }
      const principalId = String(req.params['principalId']);
      if (UUID_PATTERN.test(principalId)) {
        await memberships.removeMember(group.id, principalId);
      }
      res.status(204).end();
    },
  );
}
