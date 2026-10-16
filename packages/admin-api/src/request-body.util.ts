import express, { type RequestHandler } from 'express';
import { sendAdminError } from './admin-error-response.js';

/**
 * Parses a JSON request body, answering a malformed one with the shared
 * `400` error envelope instead of letting `express.json()`'s raw
 * `SyntaxError` fall through to the generic `500` handler.
 */
export const parseJsonBody: RequestHandler = (req, res, next) => {
  express.json()(req, res, (error?: unknown) => {
    if (error) {
      sendAdminError(
        res,
        400,
        'invalid_body',
        'The request body is not valid JSON.',
      );
      return;
    }
    next();
  });
};

/** A string with at least one non-whitespace character. */
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/** `null` (no limit) or a non-negative safe integer. */
export const isQuotaLimit = (value: unknown): value is number | null =>
  value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
