import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, {
  type Express,
  type RequestHandler,
  type Response,
} from 'express';

/** Where the UI is served, below the server root. */
export const ADMIN_UI_PATH = '/admin-ui';

/**
 * The Content-Security-Policy of the admin UI pages. Scripts, fonts, images
 * and API calls are same-origin only; `style-src` allows inline styles
 * because Ant Design injects its component styles at runtime. It applies to
 * `/admin-ui` only, so the DAV responses are not affected.
 */
export const ADMIN_UI_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * The default location of the built UI: `packages/admin-ui/dist` next to
 * this package, in a checkout as well as in the Docker image.
 */
export function defaultAdminUiDirectory(): string {
  return fileURLToPath(new URL('../../../../admin-ui/dist', import.meta.url));
}

/** Options for {@link registerAdminUiRoute}. */
export interface AdminUiRouteOptions {
  /** The directory with the built UI (`index.html` and `assets/`). */
  directory: string;
}

/**
 * Serves the built admin UI single-page app under {@link ADMIN_UI_PATH}
 * (M14). The pages are public — they hold no secrets and every API call
 * the app makes carries the user's own credentials — so this is mounted
 * before tenant resolution and authentication.
 *
 * - Files with a content hash under `assets/` are cached for a year;
 *   `index.html` is never cached, so a new build is picked up at once.
 * - A client-side route (`/admin-ui/users`) answers with `index.html`; a
 *   missing file with an extension (`/admin-ui/assets/x.js`) is a plain 404.
 *
 * @throws An `Error` if `options.directory` has no `index.html`: an
 * operator who enabled the UI should learn at start-up that the build is
 * missing, not from a 404 in the browser.
 */
export function registerAdminUiRoute(
  app: Express,
  options: AdminUiRouteOptions,
): void {
  const indexFile = path.join(options.directory, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(
      `DAVNODE_ADMIN_UI_ENABLED is set, but there is no admin UI build at ${options.directory}. Build it with "npm run build -w @davnode/admin-ui" or point DAVNODE_ADMIN_UI_DIR at one.`,
    );
  }

  const setHeaders = (res: Response): void => {
    res.set('Content-Security-Policy', ADMIN_UI_CSP);
  };
  const sendIndex = (res: Response): void => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  };

  const headers: RequestHandler = (_req, res, next) => {
    setHeaders(res);
    next();
  };

  app.use(
    ADMIN_UI_PATH,
    headers,
    express.static(options.directory, {
      index: false,
      // Vite names bundles after their content, so they never change.
      setHeaders: (res, filePath) => {
        res.set(
          'Cache-Control',
          filePath.includes(`${path.sep}assets${path.sep}`)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        );
      },
    }),
    (req, res, next) => {
      if (
        (req.method !== 'GET' && req.method !== 'HEAD') ||
        path.extname(req.path) !== ''
      ) {
        next();
        return;
      }
      sendIndex(res);
    },
  );
}
