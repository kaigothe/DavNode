import type { Router } from 'express';
import { requireAdminRole } from './require-admin-role.middleware.js';
import type { DataSource } from '@davnode/core';

/** What the metrics endpoint needs from the server's metrics. */
export interface MetricsSource {
  /** `Content-Type` of {@link render}'s output. */
  contentType: string;
  /** The Prometheus text exposition format. */
  render(): Promise<string>;
}

/**
 * Registers `GET /metrics` (M12): the server's metrics in the Prometheus
 * text exposition format. `server_admin` only, since the figures cover all
 * tenants (`{tenantSlug}` in the URL is merely the requester's anchor, as
 * for the other tenant-management routes); a `tenant_admin` or `member`
 * gets `403`.
 */
export function registerMetricsRoute(
  router: Router,
  dataSource: DataSource,
  metrics: MetricsSource,
): void {
  router.get(
    '/metrics',
    requireAdminRole(dataSource, 'server_admin'),
    async (_req, res) => {
      res.set('Content-Type', metrics.contentType).send(await metrics.render());
    },
  );
}
