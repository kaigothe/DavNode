import type { Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  createDataSource,
  setLogSink,
  startDigestNonceSweep,
  startQuotaReconciliationCron,
  type DataSource,
  type DigestNonceStore,
  type ScheduledTask,
} from '@davnode/core';
import { createApp } from './app.js';
import {
  createLogger,
  parseLogLevel,
  toLogSink,
  type Logger,
  type LogLevel,
} from './logging/logger.js';
import { parseAuthConfig } from './auth-config.js';

/** Default HTTP port, used when `DAVNODE_HTTP_PORT` isn't set. */
const DEFAULT_HTTP_PORT = 8080;

/** Default HTTP host, used when `DAVNODE_HTTP_HOST` isn't set. */
const DEFAULT_HTTP_HOST = '0.0.0.0';

/** Options for {@link startServer}, overriding environment-derived defaults. */
export interface StartServerOptions {
  /** Defaults to `process.env`; tests can supply a plain object instead. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to a JSON logger at `DAVNODE_LOG_LEVEL` writing to standard output. */
  logger?: Logger;
}

/** A started server, the DataSource backing it, and its in-process quota reconciliation job, so all three can be closed together. */
export interface RunningServer {
  logger: Logger;
  server: Server;
  dataSource: DataSource;
  quotaReconciliationTask: ScheduledTask;
  /** Periodic cleanup of the Digest nonce store; present when Digest is enabled. */
  digestNonceSweepTask?: ScheduledTask;
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
 * Pending database migrations are applied at startup unless
 * `DAVNODE_RUN_MIGRATIONS=false`.
 *
 * `DAVNODE_DEFAULT_TENANT` names the tenant RFC 6764 discovery
 * (`/.well-known/caldav`) resolves plain usernames against.
 *
 * The offered authentication schemes come from `DAVNODE_AUTH_PROVIDERS`
 * (see `parseAuthConfig`); an invalid setup rejects before the database
 * is touched. With Digest enabled, its nonce store is swept by an
 * in-process cron job as well.
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
  // Resolved before touching the database so a misconfiguration (an
  // unknown provider, oauth2 without issuers) fails fast and clearly.
  const auth = parseAuthConfig(env);
  const logger =
    options.logger ?? createLogger(parseLogLevel(env.DAVNODE_LOG_LEVEL));
  // Messages from @davnode/core and the error handlers go to the same log.
  setLogSink(toLogSink(logger));
  const dataSource = createDataSource(env);
  await dataSource.initialize();
  // A fresh database has no tables; without this a container started
  // against an empty Postgres would answer every request with a 500.
  // Disable with DAVNODE_RUN_MIGRATIONS=false when migrations are applied
  // out of band, or when several instances share one database.
  if (env.DAVNODE_RUN_MIGRATIONS?.trim().toLowerCase() !== 'false') {
    const applied = await dataSource.runMigrations();
    if (applied.length > 0) {
      logger.info(
        { migrations: applied.map((m) => m.name) },
        `Applied ${applied.length} database migration(s)`,
      );
    }
  }

  const app = createApp(dataSource, {
    auth,
    logger,
    defaultTenant: env.DAVNODE_DEFAULT_TENANT?.trim() || undefined,
  });
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

  const digestNonceSweepTask = auth.providers.includes('digest')
    ? startDigestNonceSweep(app.locals['digestNonceStore'] as DigestNonceStore)
    : undefined;

  return {
    logger,
    server,
    dataSource,
    quotaReconciliationTask,
    digestNonceSweepTask,
  };
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
  digestNonceSweepTask,
}: RunningServer): Promise<void> {
  await quotaReconciliationTask.stop();
  await digestNonceSweepTask?.stop();
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

/** The log level for messages written before configuration is validated (an invalid level falls back to `info`). */
function bootLogLevel(): LogLevel {
  try {
    return parseLogLevel(process.env.DAVNODE_LOG_LEVEL);
  } catch {
    return 'info';
  }
}

async function main(): Promise<void> {
  const logger = createLogger(bootLogLevel());
  let running: RunningServer;
  try {
    running = await startServer({ logger });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exitCode = 1;
    return;
  }

  const address = running.server.address();
  const location =
    typeof address === 'string'
      ? address
      : `${address?.address}:${address?.port}`;
  logger.info(
    { address: location, database: running.dataSource.options.type },
    'Server listening',
  );

  const handleSignal = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Shutting down');
    shutdown(running)
      .then(() => {
        logger.info('Shutdown complete');
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, 'Error during shutdown');
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
    createLogger('error').error({ err: error }, 'Server failed');
    process.exitCode = 1;
  });
}
