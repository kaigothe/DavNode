import express from 'express';

/**
 * Creates the Express application, without starting it. Keeping app
 * construction separate from `.listen()` keeps the app importable and
 * testable (e.g. with a request-testing library) without ever binding a
 * port. Route mounting happens in later milestones' sub-tasks — at this
 * stage the app has no routes of its own, so any request just gets
 * Express's own default 404.
 */
export function createApp(): express.Express {
  return express();
}
