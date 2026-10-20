# DavNode deployment bundle

A ready-to-run setup with DavNode, PostgreSQL and Caddy (automatic HTTPS).
It needs Docker with Compose and a host name that points to this machine
(ports 80 and 443 open). No source code or build is required.

```bash
cp .env.example .env        # set DOMAIN and POSTGRES_PASSWORD
docker compose up -d
```

Create the first tenant and administrator:

```bash
docker compose exec app node packages/core/dist/cli/bootstrap.js \
  --tenant-slug=demo --tenant-name="Demo" \
  --username=admin --email=admin@example.com --password='choose-a-password'
```

Check it: `curl -u admin:choose-a-password https://$DOMAIN/dav/demo/files/`.

## Upgrade

Back up first (see the backup runbook in the project documentation), then:

```bash
# set DAVNODE_VERSION in .env to the new release (or keep "latest")
docker compose pull
docker compose up -d
```

Schema migrations run automatically when the new container starts. To go
back, restore the backup and start the old image version.

## Verify the image

```bash
cosign verify ghcr.io/kaigothe/davnode:<version> \
  --certificate-identity-regexp 'https://github.com/kaigothe/DavNode/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```
