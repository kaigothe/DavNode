import {
  buildErrorResponse,
  parseReportRootElement,
  type DataSource,
  type ReportContext,
  type ReportRegistry,
} from '@davnode/core';
import express, { type Express, type Request, type Response } from 'express';
import { requirePrincipal, requireTenant } from './dav-request.util.js';

/**
 * Registers the REPORT route (RFC 3253 §3.6) — a single Express route
 * for the whole `/dav/{tenantSlug}/...` tree, since REPORT can target
 * any DAV resource (a principal collection for
 * `principal-property-search`, a regular collection for M4's
 * `sync-collection`, a calendar/addressbook collection for M5/M6's own
 * reports, ...): it reads the request body's root XML element, looks up
 * a matching handler in `registry`, and dispatches to it.
 *
 * This route makes no assumption about what a specific report's request
 * or response looks like — only that every report needs the same
 * `tenant`/`principal`/DB-manager context (`ReportContext`) and produces
 * a status + XML body (`ReportResult`). Adding a new report type only
 * ever means registering another handler (`ReportRegistry.register`),
 * never touching this file.
 *
 * - No body, or a body that isn't well-formed XML → `400 Bad Request`.
 * - A well-formed body whose root element has no registered handler →
 *   `415 Unsupported Media Type` with a `<D:supported-report/>`
 *   `<D:error>` body (RFC 3253 §3.6).
 */
export function registerReportRoute(
  app: Express,
  dataSource: DataSource,
  registry: ReportRegistry,
): void {
  app.report(
    '/dav/:tenantSlug{/*splat}',
    express.text({ type: () => true }),
    async (req: Request, res: Response): Promise<void> => {
      const tenant = requireTenant(req);
      const principal = requirePrincipal(req);
      const body = typeof req.body === 'string' ? req.body : '';

      const rootElement = parseReportRootElement(body);
      if (!rootElement) {
        res.sendStatus(400);
        return;
      }

      const handler = registry.resolve(rootElement.namespace, rootElement.name);
      if (!handler) {
        res
          .status(415)
          .set('Content-Type', 'application/xml; charset=utf-8')
          .send(buildErrorResponse(['supported-report']));
        return;
      }

      const context: ReportContext = {
        tenant,
        principal,
        manager: dataSource.manager,
      };
      const result = await handler.handle(body, context);
      res
        .status(result.status)
        .set('Content-Type', 'application/xml; charset=utf-8')
        .send(result.body);
    },
  );
}
