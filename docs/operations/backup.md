# Backup and restore

Everything DavNode stores — files, contacts, events, users, groups, ACLs,
locks, quota counters and the schema version — lives in **one database**.
A backup of that database is therefore a complete backup; there is no
separate file store to copy, and DavNode has no backup scheduler of its own.
Schedule backups with your host's cron or a backup tool, outside the app.

A restore brings back the **whole** application state as of the backup:
every tenant, user, ACL and quota counter, in all three domains (files,
addressbooks, calendars). It also brings back the table that records which
migrations have run, so the app starts without applying anything.

> **A backup contains password hashes and Digest `HA1` values, and all user
> data.** Store it encrypted, with the access rights you would give the
> database itself.

The commands below were run against the versions the compose files use
(PostgreSQL 17, MySQL 9) and against SQLite. They use the service names of
`docker-compose.yml`; add `-f docker-compose.yml -f docker-compose.prod.yml
--env-file .env.prod` after `docker compose` for the production setup.

## PostgreSQL

Back up (custom format, compressed, consistent while the app keeps running):

```
docker compose exec -T postgres pg_dump -U davnode -Fc davnode > davnode-$(date +%F).dump
```

Restore into an **empty** database (a new server, or after dropping and
recreating the database):

```
docker compose exec -T postgres pg_restore -U davnode -d davnode --no-owner --exit-on-error < davnode-2026-10-17.dump
```

Stop the app while restoring, then start it again. Automate with cron on the
host, for example every night at 02:30, keeping the last 14 dumps:

```
30 2 * * * cd /srv/davnode && docker compose exec -T postgres pg_dump -U davnode -Fc davnode > /backups/davnode-$(date +\%F).dump && find /backups -name 'davnode-*.dump' -mtime +14 -delete
```

## MySQL / MariaDB

Back up (a transaction-consistent snapshot without locking the tables):

```
docker compose exec -T mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 davnode > davnode-$(date +%F).sql
```

Restore into an **empty** database:

```
docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e 'CREATE DATABASE IF NOT EXISTS davnode CHARACTER SET utf8mb4'
docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" davnode < davnode-2026-10-17.sql
```

Notes:

- Use an account with the `RELOAD` privilege (root here). The application
  account `davnode` does not have it and `mysqldump` stops with "Access
  denied; you need the RELOAD or FLUSH_TABLES privilege".
- `--set-gtid-purged=OFF` avoids `ERROR 3546 ... GTID_PURGED cannot be
changed` when restoring into a server that has already executed
  transactions. It is a MySQL option; MariaDB's `mysqldump` has no GTID
  setting of this name, so leave it out there (not tested with MariaDB).

## SQLite

**Do not copy the `.sqlite` file while DavNode is running.** The file is
only consistent between transactions; a plain `cp` or file-system snapshot
taken during a write can capture a half-written state (and ignores the
write-ahead log), and you will not notice until you try to restore. Use
SQLite's own online backup, which copies a consistent snapshot while the app
keeps working. Either with the `sqlite3` command-line tool:

```
sqlite3 /path/to/davnode.sqlite ".backup '/backups/davnode-$(date +%F).sqlite'"
# or:
sqlite3 /path/to/davnode.sqlite "VACUUM INTO '/backups/davnode-$(date +%F).sqlite'"
```

or, in the DavNode container, which has no `sqlite3` binary, with the
`better-sqlite3` library the app uses:

```
docker compose exec app node -e "require('better-sqlite3')('/app/data/davnode.sqlite').backup('/app/data/backup.sqlite').then(() => console.log('done'))"
docker compose cp app:/app/data/backup.sqlite ./davnode-$(date +%F).sqlite
```

Restore by stopping the app and replacing `davnode.sqlite` with the backup
file (and deleting any `davnode.sqlite-wal`/`-shm` next to it).

## How often, how long

These are starting points, not something the server enforces:

- **Daily** is a sensible minimum; with frequent edits, add an hourly dump
  of the day's work. What you can afford to lose is the interval between
  backups.
- Keep **14 daily** copies and **8 weekly** ones, and at least one copy
  **off the host**, since a backup on the machine that dies dies with it.
- Keep the backups of the last migration generation around when upgrading:
  a newer app applies migrations to a restored older database on start, but
  an older app cannot read a database a newer one has migrated.

## Prove that it works

A backup you have never restored is a hope, not a backup. The repository
contains `scripts/restore-test/run.sh`, which does the PostgreSQL procedure
above from scratch — start, write a file, a contact and an event, `pg_dump`,
destroy the database, `pg_restore` into a new one, start the app **without
running migrations** — and checks that the admin can log in, that all three
objects are back byte for byte and that the quota counters match. A GitHub
workflow runs it weekly, and also runs it with a deliberately stale backup
and requires that this fails, so the check itself cannot silently rot. Run it
yourself with Docker and a built workspace:

```
npm run build --workspaces
scripts/restore-test/run.sh
```
