# Migrating to DavNode

DavNode stores calendars and contacts as standard iCalendar/vCard objects, so
anything that can export `.ics` and `.vcf` files can be imported. The script
`scripts/migrate/import-dav.mjs` uploads a directory tree of such files into
one user's account over normal DAV requests. It is idempotent: running it
again overwrites objects with the same file name instead of duplicating them.

```bash
node scripts/migrate/import-dav.mjs --base https://dav.example.com \
  --tenant demo --user alice --password '…' --source ./export/alice
```

Each sub-directory of `--source` becomes a calendar (if it holds `.ics`
files) or an address book (if it holds `.vcf` files) named like the
directory. Use `--dry-run` to see what would happen. The script needs the
user's principal id; it looks it up through the admin API when the account
may read `/admin/{tenant}/users`, otherwise pass `--principal-id`.

Create the users first (admin API, see the README) and import as the user
whose data it is.

## From Radicale

Radicale's default "filesystem" storage already has the right layout:
`<storage>/collection-root/<user>/<collection>/*.ics|*.vcf`. Stop Radicale
(or copy the folder), then point `--source` at
`collection-root/<user>` for every user. Files named `.Radicale.props` and
the `.Radicale.cache` folders are ignored.

## From Baïkal, DAViCal and other servers

Export each calendar and address book as a single `.ics`/`.vcf` file from
the old server's web interface or with a client, split it into one object per
file (a vCard file may hold many cards; an iCalendar file may hold several
events with different UIDs), place the files in one folder per collection and
import. Tools such as `vdirsyncer` can also sync an old server straight to a
local folder in this layout:
`vdirsyncer` with a `filesystem` storage and `fileext = ".ics"` / `".vcf"`.

## From Nextcloud

In Nextcloud, export calendars (calendar settings → export) and contacts
(contacts app → settings → export) as single files, split them as above, and
import. Files can be copied with any WebDAV client (`rclone`, `cadaver`)
from `https://nextcloud/remote.php/dav/files/<user>/` to
`https://dav.example.com/dav/<tenant>/files/`.

## What is not migrated

Sharing and ACLs, calendar subscriptions, reminders stored outside the
events, colours and display names of collections, and app-specific data.
Re-create sharing with ACLs (`ACL` requests or client features) after the
import. Passwords cannot be moved (the hash formats differ): set them through
`POST /admin/{tenant}/users/{userId}/password`.
