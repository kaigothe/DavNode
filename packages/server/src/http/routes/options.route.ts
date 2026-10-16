import type { Express, Request, Response } from 'express';

/** HTTP methods and DAV compliance tokens a resource tree supports. */
interface TreeCapabilities {
  methods: readonly string[];
  compliance: readonly string[];
}

/** Always advertised: Class 1 and 2 (locking) of RFC 4918, plus RFC 3744 ACL properties. */
const BASE_COMPLIANCE = ['1', '2', '3', 'access-control'] as const;

const READ = ['OPTIONS', 'GET', 'HEAD', 'PROPFIND', 'REPORT'] as const;

/**
 * What each tree under `/dav/{tenantSlug}` actually implements — kept in
 * step with the route registrations in `app.ts`, so `Allow` never
 * advertises a method that would answer `405`.
 */
const TREES: Record<string, TreeCapabilities> = {
  // The WebDAV file tree: the full RFC 4918 method set plus RFC 3744 ACL.
  files: {
    methods: [
      ...READ,
      'PUT',
      'DELETE',
      'PROPPATCH',
      'MKCOL',
      'COPY',
      'MOVE',
      'LOCK',
      'UNLOCK',
      'ACL',
    ],
    compliance: BASE_COMPLIANCE,
  },
  calendars: {
    methods: [...READ, 'PUT', 'DELETE', 'MKCALENDAR', 'LOCK', 'UNLOCK', 'POST'],
    compliance: [
      ...BASE_COMPLIANCE,
      'calendar-access',
      'calendar-auto-schedule',
    ],
  },
  addressbooks: {
    methods: [...READ, 'PUT', 'DELETE', 'MKCOL', 'LOCK', 'UNLOCK'],
    compliance: [...BASE_COMPLIANCE, 'addressbook', 'extended-mkcol'],
  },
  principals: {
    methods: ['OPTIONS', 'PROPFIND', 'REPORT'],
    compliance: [
      ...BASE_COMPLIANCE,
      'calendar-access',
      'calendar-auto-schedule',
      'addressbook',
    ],
  },
};

/** What the tenant root and unknown paths advertise: discovery clients read the compliance tokens, nothing else is served there. */
const ROOT: TreeCapabilities = {
  methods: ['OPTIONS', 'REPORT'],
  compliance: [
    ...BASE_COMPLIANCE,
    'calendar-access',
    'calendar-auto-schedule',
    'addressbook',
  ],
};

/**
 * Registers `OPTIONS` for everything under `/dav/{tenantSlug}`
 * (M11, milestones/M11-client-compatibility/04-windows-miniredir-
 * compatibility; no earlier milestone had implemented it):
 *
 * - `DAV` lists the compliance classes of the tree addressed: `1, 2`
 *   (and `3`, RFC 4918 as a whole), `access-control`, and for the
 *   calendar, addressbook and principal trees the CalDAV/CardDAV
 *   tokens clients use to recognise a server (`calendar-access`,
 *   `calendar-auto-schedule`, `addressbook`, `extended-mkcol`).
 * - `Allow` lists the methods that tree really implements.
 * - `MS-Author-Via: DAV` tells the Windows mini-redirector the share is
 *   WebDAV with write support; without it Explorer may fall back to
 *   read-only or refuse to open files for editing.
 *
 * Like every other `/dav` route it sits behind tenant resolution and
 * authentication, so an unauthenticated `OPTIONS` answers `401` and the
 * client retries with credentials.
 */
export function registerOptionsRoute(app: Express): void {
  app.options(
    '/dav/:tenantSlug{/*splat}',
    (req: Request, res: Response): void => {
      const first = req.path.split('/').filter(Boolean)[2] ?? '';
      const tree = TREES[first] ?? ROOT;
      res.set({
        DAV: tree.compliance.join(', '),
        Allow: tree.methods.join(', '),
        'MS-Author-Via': 'DAV',
      });
      res.status(200).end();
    },
  );
}
