import type { DataSource } from '@davnode/core';
import type { Express } from 'express';

/** A database that does not answer within this time counts as down. */
const DB_TIMEOUT_MS = 3000;

/**
 * Registers `GET /healthz` (M12, milestones/M12-hardening/
 * 01-health-and-production-deployment): the probe Docker and orchestrators
 * use to tell "the process runs" from "the service works".
 *
 * It sits outside `/dav/{tenant}`, tenant resolution and authentication —
 * probes carry no credentials — and is therefore registered ahead of them.
 * It answers `200 {"status":"ok"}` when a trivial query reaches the
 * database and `503 {"status":"unavailable"}` when it fails or hangs; the
 * body never carries error detail. It is never cached.
 *
 * @param dataSource - An initialized DataSource; its connection is what is
 * being checked.
 */
export function registerHealthRoute(
  app: Express,
  dataSource: DataSource,
): void {
  app.get('/healthz', async (_req, res): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    try {
      await Promise.race([
        dataSource.query('SELECT 1'),
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error('database health check timed out')),
            DB_TIMEOUT_MS,
          ).unref();
        }),
      ]);
      res.status(200).json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
}
