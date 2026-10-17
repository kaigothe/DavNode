import { Tenant, type DataSource } from '@davnode/core';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { AuthObserver } from '../http/auth-observer.js';

/**
 * HTTP methods that get a label of their own. Anything else is reported
 * as `OTHER`: the method comes from the client, and an unbounded label
 * would let anyone inflate the metric's memory by inventing methods.
 */
const KNOWN_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'OPTIONS',
  'PATCH',
  'PROPFIND',
  'PROPPATCH',
  'MKCOL',
  'COPY',
  'MOVE',
  'LOCK',
  'UNLOCK',
  'REPORT',
  'ACL',
  'MKCALENDAR',
]);

const normalizeMethod = (method: string): string =>
  KNOWN_METHODS.has(method) ? method : 'OTHER';

/** The server's metrics, kept in this process (M12). */
export interface Metrics {
  /** Records one finished request. */
  observeRequest(method: string, status: number, durationSeconds: number): void;
  /** Counts failed credential checks per scheme; plug it into the auth middlewares. */
  readonly authObserver: AuthObserver;
  /** `Content-Type` of {@link Metrics.render}'s output. */
  readonly contentType: string;
  /** The Prometheus text exposition of all metrics, current as of now. */
  render(): Promise<string>;
}

/**
 * Creates the metrics registry of one app:
 *
 * - `http_requests_total{method,status}`
 * - `http_request_duration_seconds{method}` (histogram)
 * - `auth_failures_total{scheme}`
 * - `quota_used_bytes{tenant_slug}`, read from the database at scrape time
 *
 * Request metrics deliberately carry **no** tenant, user or path label:
 * their number is unbounded, and every distinct label combination is a
 * time series Prometheus has to store. Only the quota gauge is labelled by
 * tenant, because there are far fewer tenants than users or URLs.
 *
 * Counters live in this process; Prometheus scrapes the endpoint and keeps
 * the history, DavNode keeps none.
 */
export function createMetrics(dataSource: DataSource): Metrics {
  const registry = new Registry();

  const requests = new Counter({
    name: 'http_requests_total',
    help: 'HTTP requests handled, by method and status code.',
    labelNames: ['method', 'status'],
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Time from receiving a request to sending its response, by method.',
    labelNames: ['method'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  const authFailures = new Counter({
    name: 'auth_failures_total',
    help: 'Credentials presented and rejected, by authentication scheme.',
    labelNames: ['scheme'],
    registers: [registry],
  });
  // Create the series up front, so a dashboard shows 0 instead of "no data".
  for (const scheme of ['basic', 'digest', 'oauth2']) {
    authFailures.inc({ scheme }, 0);
  }
  new Gauge({
    name: 'quota_used_bytes',
    help: 'Storage used per tenant, in bytes.',
    labelNames: ['tenant_slug'],
    registers: [registry],
    async collect() {
      this.reset();
      const tenants = await dataSource.getRepository(Tenant).find();
      for (const tenant of tenants) {
        this.set({ tenant_slug: tenant.slug }, tenant.quotaUsedBytes);
      }
    },
  });

  return {
    observeRequest(method, status, durationSeconds) {
      const label = normalizeMethod(method);
      requests.inc({ method: label, status: String(status) });
      duration.observe({ method: label }, durationSeconds);
    },
    authObserver: {
      failure: (_req, scheme) => authFailures.inc({ scheme }),
      success: () => undefined,
    },
    contentType: registry.contentType,
    render: () => registry.metrics(),
  };
}
