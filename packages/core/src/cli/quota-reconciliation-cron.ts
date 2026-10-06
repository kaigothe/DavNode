import { pathToFileURL } from 'node:url';
import { schedule, validate, type ScheduledTask } from 'node-cron';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../db/data-source.js';
import { Tenant } from '../entities/tenant.entity.js';
import { recomputeQuotaForTenant } from '../quota/recompute-quota.js';

/** Daily at 03:00 — late enough that it rarely overlaps business-hours write traffic, early enough to finish before a new day's usage starts. */
const DEFAULT_CRON_SCHEDULE = '0 3 * * *';

/**
 * Reconciles every tenant's quota, one at a time rather than
 * concurrently (`milestones/M8-quota/05-quota-recompute/01-reconciliation-job.md`:
 * avoids a load spike against the database when there are many
 * tenants). Each tenant's own failure is caught, logged, and skipped —
 * it never aborts the run for the tenants after it — and each tenant's
 * own runtime is logged alongside it, success or failure.
 */
export async function reconcileAllTenants(
  dataSource: DataSource,
): Promise<void> {
  const tenants = await dataSource.getRepository(Tenant).find();

  for (const tenant of tenants) {
    const startedAt = Date.now();
    try {
      await recomputeQuotaForTenant(dataSource, tenant.id);
      console.log(
        `Quota reconciliation for tenant "${tenant.slug}" completed in ${Date.now() - startedAt}ms.`,
      );
    } catch (error) {
      console.error(
        `Quota reconciliation for tenant "${tenant.slug}" failed after ${Date.now() - startedAt}ms:`,
        error,
      );
    }
  }
}

/**
 * Schedules {@link reconcileAllTenants} as an in-process `node-cron` job
 * (planning/01-decisions.md, Runde 16 — no separate cron container or
 * job queue for v1) against `dataSource`, which must already be
 * initialized. `cronExpression` defaults to `'0 3 * * *'` (daily at
 * 03:00); the server's own startup passes
 * `DAVNODE_QUOTA_RECONCILE_CRON` when set.
 *
 * A run's own error is already caught and logged per tenant inside
 * {@link reconcileAllTenants} itself; this only guards against that
 * function's *own* promise rejecting (it shouldn't, but a scheduled
 * callback with no `.catch` would otherwise surface as an unhandled
 * rejection and, depending on process configuration, crash the server).
 *
 * @throws An `Error` if `cronExpression` isn't a valid cron expression
 * — caught at startup, not at the job's first scheduled run, so a
 * typo in `DAVNODE_QUOTA_RECONCILE_CRON` is visible immediately rather
 * than silently never reconciling anything.
 */
export function startQuotaReconciliationCron(
  dataSource: DataSource,
  cronExpression: string = DEFAULT_CRON_SCHEDULE,
): ScheduledTask {
  if (!validate(cronExpression)) {
    throw new Error(
      `Invalid quota reconciliation cron expression: "${cronExpression}".`,
    );
  }

  return schedule(cronExpression, () => {
    reconcileAllTenants(dataSource).catch((error: unknown) => {
      console.error('Quota reconciliation run failed:', error);
    });
  });
}

async function main(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    await reconcileAllTenants(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

// Only run when this file is executed directly (`node dist/cli/quota-reconciliation-cron.js`),
// not when it's imported — e.g. by the server process, which schedules
// startQuotaReconciliationCron itself instead of running this one-shot
// path, or by tests exercising reconcileAllTenants/startQuotaReconciliationCron.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error('Quota reconciliation failed:', error);
    process.exitCode = 1;
  });
}
