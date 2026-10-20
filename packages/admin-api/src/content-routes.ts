import {
  ContentInspectionService,
  MAX_EVENT_WINDOW_MS,
  UserService,
  type DataSource,
  type User,
} from '@davnode/core';
import type { Request, Response, Router } from 'express';
import { sendAdminError } from './admin-error-response.js';
import { requirePrincipal, requireTenant } from './admin-request.util.js';
import { parseListQuery } from './pagination.util.js';
import { requireAdminRole } from './require-admin-role.middleware.js';
import type { AdminRouterOptions } from './router.js';

/** One read of a user's calendar or contact data, reported to `onContentAccess`. */
export interface ContentAccess {
  /** Principal id of the admin who read the data. */
  adminPrincipalId: string;
  /** Id of the user whose data was read. */
  targetUserId: string;
  tenantSlug: string;
  /** What was read: `calendars`, `events`, `addressbooks` or `contacts`. */
  resource: 'calendars' | 'events' | 'addressbooks' | 'contacts';
  /** The calendar or address book read, when one was addressed. */
  collectionId?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_CONTACT_PAGE_SIZE = 50;

/** Parses an ISO 8601 date-time query parameter; `null` when absent or invalid. */
function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Registers the read-only calendar/contact inspection routes (M14 Große
 * Aufgabe 1/6). They only exist when `AdminRouterOptions.contentView` is
 * set: an admin reading other users' data is something an operator has to
 * opt into. Every request is reported to `onContentAccess` so it can be
 * logged.
 *
 * `tenant_admin`s reach users of their own tenant only (`requireAdminRole`
 * plus the tenant-scoped user lookup); nothing here writes.
 */
export function registerContentRoutes(
  router: Router,
  dataSource: DataSource,
  options: AdminRouterOptions,
): void {
  const users = new UserService(dataSource);
  const content = new ContentInspectionService(dataSource);
  const tenantAdmin = requireAdminRole(dataSource, 'tenant_admin');

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

  const record = (
    req: Request,
    target: User,
    resource: ContentAccess['resource'],
    collectionId?: string,
  ) =>
    options.onContentAccess?.({
      adminPrincipalId: requirePrincipal(req).id,
      targetUserId: target.id,
      tenantSlug: requireTenant(req).slug,
      resource,
      collectionId,
    });

  const notFound = (res: Response, what: string) =>
    sendAdminError(res, 404, `${what}_not_found`, `The ${what} was not found.`);

  router.get('/users/:userId/calendars', tenantAdmin, async (req, res) => {
    const target = await loadTarget(req, res);
    if (!target) {
      return;
    }
    record(req, target, 'calendars');
    const calendars = await content.listCalendars(
      target.tenantId,
      target.principalId,
    );
    res.json({
      calendars: calendars.map((calendar) => ({
        ...calendar,
        updatedAt: calendar.updatedAt.toISOString(),
      })),
    });
  });

  router.get(
    '/users/:userId/calendars/:calendarId/events',
    tenantAdmin,
    async (req, res) => {
      const from = parseInstant(req.query['from']);
      const to = parseInstant(req.query['to']);
      if (!from || !to || to.getTime() <= from.getTime()) {
        sendAdminError(
          res,
          400,
          'invalid_range',
          '"from" and "to" must be ISO 8601 date-times with "to" after "from".',
        );
        return;
      }
      if (to.getTime() - from.getTime() > MAX_EVENT_WINDOW_MS) {
        sendAdminError(
          res,
          400,
          'range_too_large',
          'The time range may span at most 366 days.',
        );
        return;
      }
      const target = await loadTarget(req, res);
      if (!target) {
        return;
      }
      const calendarId = String(req.params['calendarId']);
      const calendar = UUID_PATTERN.test(calendarId)
        ? await content.findCalendar(
            target.tenantId,
            target.principalId,
            calendarId,
          )
        : null;
      if (!calendar) {
        notFound(res, 'calendar');
        return;
      }
      record(req, target, 'events', calendar.id);
      const result = await content.listEvents(
        calendar,
        from,
        to,
        req.query['raw'] === 'true',
      );
      res.json({
        events: result.events.map((event) => ({
          ...event,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
        })),
        truncated: result.truncated,
        skipped: result.skipped,
      });
    },
  );

  router.get('/users/:userId/addressbooks', tenantAdmin, async (req, res) => {
    const target = await loadTarget(req, res);
    if (!target) {
      return;
    }
    record(req, target, 'addressbooks');
    const books = await content.listAddressbooks(
      target.tenantId,
      target.principalId,
    );
    res.json({
      addressbooks: books.map((book) => ({
        ...book,
        updatedAt: book.updatedAt.toISOString(),
      })),
    });
  });

  router.get(
    '/users/:userId/addressbooks/:addressbookId/contacts',
    tenantAdmin,
    async (req, res) => {
      const query = parseListQuery(req, res);
      if (!query) {
        return;
      }
      const target = await loadTarget(req, res);
      if (!target) {
        return;
      }
      const addressbookId = String(req.params['addressbookId']);
      const addressbook = UUID_PATTERN.test(addressbookId)
        ? await content.findAddressbook(
            target.tenantId,
            target.principalId,
            addressbookId,
          )
        : null;
      if (!addressbook) {
        notFound(res, 'addressbook');
        return;
      }
      record(req, target, 'contacts', addressbook.id);
      const { contacts, total } = await content.listContacts(addressbook, {
        limit: query.limit ?? DEFAULT_CONTACT_PAGE_SIZE,
        offset: query.offset,
        q: query.q,
        includeRaw: req.query['raw'] === 'true',
      });
      res.json({
        contacts: contacts.map((contact) => ({
          ...contact,
          updatedAt: contact.updatedAt.toISOString(),
        })),
        total,
      });
    },
  );
}
