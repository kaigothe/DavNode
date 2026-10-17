import type { RequestHandler } from 'express';
import type { Metrics } from '../metrics/metrics.js';

/** Counts every request and times it, once its response has been sent. */
export function createMetricsMiddleware(metrics: Metrics): RequestHandler {
  return (req, res, next): void => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      metrics.observeRequest(
        req.method,
        res.statusCode,
        Number(process.hrtime.bigint() - startedAt) / 1e9,
      );
    });
    next();
  };
}
