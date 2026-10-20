import { createAdminRouter, type LogSource } from '@davnode/admin-api';
import {
  AddressbookMultigetReportHandler,
  AddressbookQueryReportHandler,
  AddressbookSyncCollectionDomain,
  CALDAV_NAMESPACE,
  CalendarMultigetReportHandler,
  CalendarQueryReportHandler,
  CalendarSyncCollectionDomain,
  CARDDAV_NAMESPACE,
  DAV_NAMESPACE,
  DigestNonceStore,
  FreeBusyQueryReportHandler,
  PrincipalPropertySearchReportHandler,
  ReportRegistry,
  SyncCollectionReportHandler,
  WebDavSyncCollectionDomain,
  type DataSource,
} from '@davnode/core';
import express from 'express';
import { DEFAULT_AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { createMetricsMiddleware } from './http/metrics.middleware.js';
import { createMetrics } from './metrics/metrics.js';
import { combineObservers } from './http/auth-observer.js';
import {
  createAuthRateLimitMiddleware,
  rateLimitObserver,
} from './http/auth-rate-limit.middleware.js';
import { createSecurityHeadersMiddleware } from './http/security-headers.middleware.js';
import { AuthRateLimiter } from './security/auth-rate-limiter.js';
import {
  DEFAULT_SECURITY_CONFIG,
  type SecurityConfig,
} from './security/security-config.js';
import { createLogger, type Logger } from './logging/logger.js';
import { createRequestLoggingMiddleware } from './http/request-logging.middleware.js';
import { createAuthMiddlewares } from './http/auth-stack.js';
import { errorHandlerMiddleware } from './http/error-handler.middleware.js';
import { registerAclRoute } from './http/routes/acl.route.js';
import { registerAddMemberRoute } from './http/routes/add-member.route.js';
import { registerAddressbookHomeRoute } from './http/routes/addressbook-home.route.js';
import { registerAddressbookMkcolRoute } from './http/routes/addressbook-mkcol.route.js';
import { registerCalendarHomeRoute } from './http/routes/calendar-home.route.js';
import { registerCaldavDeleteRoute } from './http/routes/caldav/delete.route.js';
import { registerFeedTokenRoute } from './http/routes/caldav/feed-token.route.js';
import { registerCaldavGetRoute } from './http/routes/caldav/get.route.js';
import { registerCaldavLockRoute } from './http/routes/caldav/lock.route.js';
import { registerCaldavPutRoute } from './http/routes/caldav/put.route.js';
import { registerCaldavUnlockRoute } from './http/routes/caldav/unlock.route.js';
import { registerCarddavDeleteRoute } from './http/routes/carddav/delete.route.js';
import { registerCarddavGetRoute } from './http/routes/carddav/get.route.js';
import { registerCarddavLockRoute } from './http/routes/carddav/lock.route.js';
import { registerCarddavPutRoute } from './http/routes/carddav/put.route.js';
import { registerCarddavUnlockRoute } from './http/routes/carddav/unlock.route.js';
import { registerCopyRoute } from './http/routes/copy.route.js';
import { registerDeleteRoute } from './http/routes/delete.route.js';
import { registerGetRoute } from './http/routes/get.route.js';
import {
  registerAdminUiRoute,
  type AdminUiRouteOptions,
} from './http/routes/admin-ui.route.js';
import { registerHealthRoute } from './http/routes/health.route.js';
import { registerIcsFeedRoute } from './http/routes/ics-feed.route.js';
import { registerLockRoute } from './http/routes/lock.route.js';
import { registerMkcalendarRoute } from './http/routes/mkcalendar.route.js';
import { registerMkcolRoute } from './http/routes/mkcol.route.js';
import { registerMoveRoute } from './http/routes/move.route.js';
import { registerOptionsRoute } from './http/routes/options.route.js';
import { registerPrincipalsRoute } from './http/routes/principals.route.js';
import { registerPropfindRoute } from './http/routes/propfind.route.js';
import { registerProppatchRoute } from './http/routes/proppatch.route.js';
import { registerPutRoute } from './http/routes/put.route.js';
import { registerReportRoute } from './http/routes/report.route.js';
import { registerInboxRoute } from './http/routes/scheduling/inbox.route.js';
import { registerOutboxPostRoute } from './http/routes/scheduling/outbox-post.route.js';
import { registerOutboxRoute } from './http/routes/scheduling/outbox.route.js';
import { registerWellKnownRoute } from './http/routes/well-known.route.js';
import { registerTenantRootRoute } from './http/routes/tenant-root.route.js';
import { registerUnlockRoute } from './http/routes/unlock.route.js';
import { createTenantResolutionMiddleware } from './http/tenant-resolution.middleware.js';

/** Options for {@link createApp}. */
export interface CreateAppOptions {
  /** Which authentication schemes to offer; defaults to Basic only. */
  auth?: AuthConfig;
  /**
   * Tenant that `/.well-known/caldav` and `/carddav` resolve plain
   * usernames against (`DAVNODE_DEFAULT_TENANT`); without it those
   * endpoints expect `user@tenantSlug`.
   */
  defaultTenant?: string;
  /** Where the request log goes; defaults to a logger that writes nothing. */
  logger?: Logger;
  /** Rate limit and proxy settings; defaults to the built-in limit, no proxy. */
  security?: SecurityConfig;
  /**
   * Enables the Admin API's read-only calendar/contact inspection routes
   * (`DAVNODE_ADMIN_UI_CONTENT_VIEW`); every read is logged. Off by default.
   */
  adminContentView?: boolean;
  /**
   * Serves the admin UI at `/admin-ui` (`DAVNODE_ADMIN_UI_ENABLED`). Absent
   * means the UI does not exist: the path answers 404.
   */
  adminUi?: AdminUiRouteOptions;
  /**
   * The in-memory log behind the admin UI's log view
   * (`DAVNODE_ADMIN_UI_LOG_VIEW`); with it `GET /admin/{tenant}/logs`
   * exists. Absent means the log is not reachable through the API.
   */
  adminLogs?: LogSource;
}

/**
 * Creates the Express application, without starting it. Keeping app
 * construction separate from `.listen()` keeps the app importable and
 * testable (e.g. with a request-testing library) without ever binding a
 * port.
 *
 * @param dataSource - An initialized DataSource, used to build the
 * services this app's middleware/routes need.
 * @param options - See {@link CreateAppOptions}; the default is Basic
 * auth only.
 */
export function createApp(
  dataSource: DataSource,
  options: CreateAppOptions = {},
): express.Express {
  const app = express();
  const security = options.security ?? DEFAULT_SECURITY_CONFIG;
  // Do not announce the framework.
  app.disable('x-powered-by');
  if (security.behindTlsProxy) {
    // One reverse proxy in front: take the client address from its
    // X-Forwarded-For, so the rate limiter counts clients, not the proxy.
    app.set('trust proxy', 1);
  }
  const logger = options.logger ?? createLogger('silent');
  const authConfig = options.auth ?? DEFAULT_AUTH_CONFIG;
  // One counter of failed logins per client address, shared by all schemes
  // and by the discovery endpoint.
  const rateLimiter = security.rateLimit
    ? new AuthRateLimiter(security.rateLimit)
    : undefined;
  const digestNonces = new DigestNonceStore();
  // Exposed so the process entry point can run the periodic sweep (a
  // timer has no place in a plain app factory used by tests).
  app.locals['digestNonceStore'] = digestNonces;

  // The ICS feed route is deliberately registered before tenant
  // resolution and Basic-Auth: it must never prompt for credentials
  // (planning/01-decisions.md, Runde 14) — its token path segment is the
  // only authentication, checked by ics-feed.route.ts itself. Since it
  // matches this and only this route, requests to it never reach either
  // middleware below.
  app.use(
    createSecurityHeadersMiddleware({
      behindTlsProxy: security.behindTlsProxy,
    }),
  );

  // Early in the chain, so every response — also a 401 or a 429 — is
  // logged and carries an X-Request-Id.
  app.use(createRequestLoggingMiddleware(logger));

  // Liveness probe: no tenant, no credentials (M12).
  registerHealthRoute(app, dataSource);

  // The admin UI's static files need no tenant and no credentials (M14).
  if (options.adminUi) {
    registerAdminUiRoute(app, options.adminUi);
  }

  registerIcsFeedRoute(app, dataSource);

  // RFC 6764 discovery lives outside /dav/{tenantSlug}, so it brings its
  // own tenant lookup and Basic authentication and, like the ICS feed,
  // is registered ahead of the tenant-scoped middleware below.
  registerWellKnownRoute(app, dataSource, {
    defaultTenant: options.defaultTenant,
    realm: authConfig.realm,
    rateLimiter,
  });

  // Every DAV route lives under /dav/{tenantSlug}/... (path-prefix
  // tenancy) and needs the resolved Tenant before anything else runs —
  // including the auth middleware mounted right after, since usernames
  // are only unique per tenant. The Admin API (M9) reuses these same
  // two middleware *instances* on /admin/{tenantSlug}/... rather than
  // creating its own — planning/04-architecture.md's own mounting
  // instruction, and @davnode/admin-api's router.ts never resolves a
  // tenant or authenticates a request itself.
  const tenantResolution = createTenantResolutionMiddleware(dataSource);
  const metrics = createMetrics(dataSource);
  app.use(createMetricsMiddleware(metrics));

  const authenticate = createAuthMiddlewares(
    dataSource,
    authConfig,
    digestNonces,
    combineObservers(
      metrics.authObserver,
      rateLimiter && rateLimitObserver(rateLimiter),
    ),
  );
  // Before tenant resolution and authentication: a blocked address costs no
  // database lookup and no password hashing.
  if (rateLimiter) {
    const limit = createAuthRateLimitMiddleware(rateLimiter);
    app.use('/dav/:tenantSlug', limit);
    app.use('/admin/:tenantSlug', limit);
  }

  app.use('/dav/:tenantSlug', tenantResolution);
  app.use('/dav/:tenantSlug', ...authenticate);

  app.use('/admin/:tenantSlug', tenantResolution);
  app.use('/admin/:tenantSlug', ...authenticate);
  app.use(
    '/admin/:tenantSlug',
    createAdminRouter(dataSource, {
      digestRealm: authConfig.providers.includes('digest')
        ? authConfig.realm
        : undefined,
      oauth2Issuers: authConfig.oauth2Issuers.map((issuer) => issuer.issuer),
      authProviders: authConfig.providers,
      contentView: options.adminContentView === true,
      logs: options.adminLogs,
      onContentAccess: (access) =>
        logger.info(access, 'Admin read user content'),
      metrics,
    }),
  );

  // ACL authorization (the real RFC 3744 evaluation engine, replacing
  // M2's owner-only placeholder — milestones/M3-webdav-acl/
  // 07-replace-placeholder-authorization) is applied per-route rather
  // than globally here: each DAV route supplies its own resolver for
  // "what resource, and which privilege, does this request need" — see
  // createAclAuthorizationMiddleware. COPY and MOVE are the exception:
  // they check two resources (source and destination parent), which
  // that single-resolver middleware isn't shaped for, so they run
  // hasPrivilege inline instead — see copy.route.ts/move.route.ts.
  registerOptionsRoute(app);
  registerTenantRootRoute(app, dataSource);
  registerPropfindRoute(app, dataSource);
  registerProppatchRoute(app, dataSource);
  registerMkcolRoute(app, dataSource);
  registerGetRoute(app, dataSource);
  registerPutRoute(app, dataSource);
  registerDeleteRoute(app, dataSource);
  registerCopyRoute(app, dataSource);
  registerMoveRoute(app, dataSource);
  registerAclRoute(app, dataSource);
  registerLockRoute(app, dataSource);
  registerUnlockRoute(app, dataSource);
  registerPrincipalsRoute(app, dataSource);
  registerAddressbookHomeRoute(app, dataSource);
  registerAddressbookMkcolRoute(app, dataSource);
  // Registered before registerCalendarHomeRoute/registerCaldavGetRoute/
  // registerCaldavDeleteRoute: those match the same broad
  // /calendars/:userId{/*splat} path per method, and since "inbox"/
  // "outbox" are reserved calendar names, would otherwise resolve them
  // as "no such calendar" and answer first. Express tries same-method
  // routes in registration order, so the more specific pattern has to
  // come first.
  registerInboxRoute(app, dataSource);
  registerOutboxRoute(app, dataSource);
  // RFC 5995 add-member rewrites into the PUT routes below.
  registerAddMemberRoute(app);
  registerCalendarHomeRoute(app, dataSource);
  registerMkcalendarRoute(app, dataSource);
  registerCaldavGetRoute(app, dataSource);
  registerCaldavPutRoute(app, dataSource);
  registerCaldavDeleteRoute(app, dataSource);
  registerCaldavLockRoute(app, dataSource);
  registerCaldavUnlockRoute(app, dataSource);
  registerFeedTokenRoute(app, dataSource);
  registerOutboxPostRoute(app, dataSource);
  registerCarddavGetRoute(app, dataSource);
  registerCarddavPutRoute(app, dataSource);
  registerCarddavDeleteRoute(app, dataSource);
  registerCarddavLockRoute(app, dataSource);
  registerCarddavUnlockRoute(app, dataSource);

  // REPORT handlers register themselves into this registry — see
  // report.route.ts.
  const reportRegistry = new ReportRegistry();
  reportRegistry.register(
    DAV_NAMESPACE,
    'principal-property-search',
    new PrincipalPropertySearchReportHandler(),
  );
  reportRegistry.register(
    DAV_NAMESPACE,
    'sync-collection',
    new SyncCollectionReportHandler([
      new WebDavSyncCollectionDomain(),
      new AddressbookSyncCollectionDomain(),
      new CalendarSyncCollectionDomain(),
    ]),
  );
  reportRegistry.register(
    CARDDAV_NAMESPACE,
    'addressbook-multiget',
    new AddressbookMultigetReportHandler(),
  );
  reportRegistry.register(
    CARDDAV_NAMESPACE,
    'addressbook-query',
    new AddressbookQueryReportHandler(),
  );
  reportRegistry.register(
    CALDAV_NAMESPACE,
    'calendar-multiget',
    new CalendarMultigetReportHandler(),
  );
  reportRegistry.register(
    CALDAV_NAMESPACE,
    'calendar-query',
    new CalendarQueryReportHandler(),
  );
  reportRegistry.register(
    CALDAV_NAMESPACE,
    'free-busy-query',
    new FreeBusyQueryReportHandler(),
  );
  registerReportRoute(app, dataSource, reportRegistry);

  // Must stay last: Express only treats a 4-argument middleware as an
  // error handler, and only for errors from middleware/routes mounted
  // before it.
  app.use(errorHandlerMiddleware);

  return app;
}
