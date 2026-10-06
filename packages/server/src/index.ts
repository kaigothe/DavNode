import type { Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  createDataSource,
  startQuotaReconciliationCron,
  type DataSource,
  type ScheduledTask,
} from '@davnode/core';
import { createApp } from './app.js';

/** Default HTTP port, used when `DAVNODE_HTTP_PORT` isn't set. */
const DEFAULT_HTTP_PORT = 8080;

/** Default HTTP host, used when `DAVNODE_HTTP_HOST` isn't set. */
const DEFAULT_HTTP_HOST = '0.0.0.0';

/** Options for {@link startServer}, overriding environment-derived defaults. */
export interface StartServerOptions {
  /** Defaults to `process.env`; tests can supply a plain object instead. */
  env?: NodeJS.ProcessEnv;
}

/** A started server, the DataSource backing it, and its in-process quota reconciliation job, so all three can be closed together. */
export interface RunningServer {
  server: Server;
  dataSource: DataSource;
  quotaReconciliationTask: ScheduledTask;
}

/**
 * Initializes the TypeORM `DataSource` and only then starts the HTTP
 * server listening — in that order, so the server never accepts a
 * request before the database connection is up. Exported separately from
 * this module's "run as script" block (below) so both the startup
 * sequence and its failure mode are directly testable, without spawning
 * a real process.
 *
 * Also starts the quota reconciliation cron job (M8, planning/01-
 * decisions.md Runde 16 — in-process, no separate cron container),
 * against the same `DataSource` the HTTP server uses:
 * `DAVNODE_QUOTA_RECONCILE_CRON` overrides its schedule (default daily),
 * read as a plain cron expression rather than parsed any further here.
 *
 * @param options - See {@link StartServerOptions}.
 * @returns The running HTTP server, its DataSource, and its quota
 * reconciliation task, once all are up.
 * @throws Whatever `DataSource.initialize()` throws if the database
 * connection fails; the server is never started in that case.
 */
export async function startServer(
  options: StartServerOptions = {},
): Promise<RunningServer> {
  const env = options.env ?? process.env;
  const dataSource = createDataSource(env);
  await dataSource.initialize();

  const app = createApp(dataSource);
  const port = env.DAVNODE_HTTP_PORT
    ? Number(env.DAVNODE_HTTP_PORT)
    : DEFAULT_HTTP_PORT;
  const host = env.DAVNODE_HTTP_HOST ?? DEFAULT_HTTP_HOST;

  const server = await new Promise<Server>((resolve, reject) => {
    const httpServer = app.listen(port, host, () => {
      httpServer.off('error', reject);
      resolve(httpServer);
    });
    httpServer.once('error', reject);
  });

  const quotaReconciliationTask = startQuotaReconciliationCron(
    dataSource,
    env.DAVNODE_QUOTA_RECONCILE_CRON,
  );

  return { server, dataSource, quotaReconciliationTask };
}

/**
 * Shuts a {@link RunningServer} down: stops the quota reconciliation
 * cron job, stops the HTTP server from accepting new connections and
 * waits for in-flight requests to finish, then closes the database
 * connection — the reverse of `startServer`'s startup order. Exported
 * separately so it's directly testable without sending a real OS signal
 * to a real process.
 */
export async function shutdown({
  server,
  dataSource,
  quotaReconciliationTask,
}: RunningServer): Promise<void> {
  await quotaReconciliationTask.stop();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
  await dataSource.destroy();
}

async function main(): Promise<void> {
  let running: RunningServer;
  try {
    running = await startServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exitCode = 1;
    return;
  }

  const address = running.server.address();
  const location =
    typeof address === 'string'
      ? address
      : `${address?.address}:${address?.port}`;
  console.log(
    `Server listening on ${location} (DB: ${running.dataSource.options.type}).`,
  );

  const handleSignal = (signal: NodeJS.Signals): void => {
    console.log(`Received ${signal}, shutting down...`);
    shutdown(running)
      .then(() => {
        console.log('Shutdown complete.');
      })
      .catch((error: unknown) => {
        console.error('Error during shutdown:', error);
        process.exitCode = 1;
      });
  };
  process.on('SIGTERM', handleSignal);
  process.on('SIGINT', handleSignal);
}

// Only run when this file is executed directly (`node dist/index.js`), not
// when it's imported — e.g. by tests exercising startServer/shutdown.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error('Server failed:', error);
    process.exitCode = 1;
  });
}
