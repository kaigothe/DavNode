# Upgrading DavNode

## Versioning

DavNode uses [Semantic Versioning](https://semver.org/) and releases
automatically from [Conventional Commits](https://www.conventionalcommits.org/):

- **patch** (`1.29.1`): bug fixes; always safe.
- **minor** (`1.30.0`): new features, backwards compatible, may add database
  migrations.
- **major** (`2.0.0`): may change configuration, the admin API or behaviour;
  read the "BREAKING CHANGES" section of the [changelog](../CHANGELOG.md)
  first.

Database migrations run **automatically when the server starts**
(`DAVNODE_RUN_MIGRATIONS=true`, the default) and only move forward. There is
no downgrade migration: to go back, restore a backup.

## Checklist

1. Read the changelog entries between your version and the target.
2. **Back up the database** ([runbook](operations/backup.md)). This is your
   rollback.
3. Pull and restart (deployment bundle or compose file):

   ```bash
   # pin the new version in .env (DAVNODE_VERSION), or keep "latest"
   docker compose pull
   docker compose up -d
   ```

4. Check `GET /healthz` and the log for `Applied N database migration(s)`.
5. Connect with a client and look at a calendar, contacts and a file.

## Rolling back

Stop the new container, restore the backup you took in step 2 into the
database, and start the previous image version. A schema that was migrated
forward is not readable by older versions, so restoring the backup is the
only supported way back.

## Several instances

DavNode runs as one instance (login rate limiting and Digest nonces are kept
in memory). If you do run more than one against the same database for
failover, set `DAVNODE_RUN_MIGRATIONS=false` and run one instance first to
migrate.

## How upgrades are tested

Every change to `main` runs `scripts/upgrade-test/run.sh` in CI: it starts
the previous release, writes users, a group, an event, a contact and a file,
then starts the new build on the same database and compares everything byte
for byte. A weekly job tests restoring a backup
([backup runbook](operations/backup.md)).
