# DavNode compared with other DAV servers

_Last reviewed: October 2026 from each project's public documentation.
Projects change; check the linked sites before deciding, and tell us if
something here is out of date._

DavNode is young. Several of the projects below are mature and the better
choice for many setups. The table shows differences in approach, not a
ranking.

|                                | DavNode                                                   | [Nextcloud](https://nextcloud.com/)                      | [Radicale](https://radicale.org/) | [Baïkal](https://sabre.io/baikal/) | [DAViCal](https://www.davical.org/) |
| ------------------------------ | --------------------------------------------------------- | -------------------------------------------------------- | --------------------------------- | ---------------------------------- | ----------------------------------- |
| What it is                     | DAV server                                                | Collaboration platform (files, calendar, contacts, apps) | Small CalDAV/CardDAV server       | CalDAV/CardDAV server on sabre/dav | CalDAV/CardDAV server               |
| Language                       | TypeScript / Node.js                                      | PHP                                                      | Python                            | PHP                                | PHP                                 |
| Files over WebDAV              | Yes                                                       | Yes                                                      | No                                | No                                 | No                                  |
| CalDAV / CardDAV               | Yes                                                       | Yes                                                      | Yes                               | Yes                                | Yes                                 |
| Scheduling (invitations)       | Yes (RFC 6638)                                            | Yes                                                      | Limited, via clients              | Yes                                | Yes                                 |
| Storage                        | PostgreSQL, MySQL or SQLite (one database for everything) | Database plus a file store                               | Files on disk                     | SQLite or MySQL                    | PostgreSQL                          |
| Multiple tenants on one server | Yes, built in                                             | Via separate setups or apps                              | No                                | No                                 | No                                  |
| Per-user/group ACLs (RFC 3744) | Yes                                                       | Sharing model                                            | Rights file                       | Basic                              | Yes                                 |
| Quotas                         | Per user and tenant                                       | Yes                                                      | No                                | No                                 | No                                  |
| Web interface                  | **No** (REST admin API only)                              | Yes                                                      | Basic                             | Admin panel                        | Limited                             |
| Maturity                       | New; conformance-tested, client verification in progress  | Very mature                                              | Mature                            | Mature                             | Mature                              |

## When to prefer something else

- You want a complete web suite with sharing, apps and a browser UI:
  **Nextcloud**.
- You want the smallest possible setup for one person's calendar and
  contacts, with no database: **Radicale**.
- You want a PHP server with a web admin panel and years of field
  experience: **Baïkal**.

## When DavNode fits

- Files, calendars and contacts for one or several teams from one server,
  one database and one backup.
- Per-group permissions and quotas, driven by a REST API.
- A Node.js stack, or a requirement to run on PostgreSQL/MySQL.
