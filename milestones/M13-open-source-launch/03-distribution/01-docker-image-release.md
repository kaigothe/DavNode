# Sub-Task: Docker-Image veröffentlichen

## Aufgabe
- Workflow bei semantic-release-Tag: Build `linux/amd64` + `linux/arm64`,
  Push nach `ghcr.io/kaigothe/davnode` mit Tags `X.Y.Z`, `X.Y`, `latest`
- Nicht-Root-User, `HEALTHCHECK` (M12-Endpunkt), kleine Basis, OCI-Labels
- Smoke-Test des gebauten Images in CI (Start, `/healthz`, Bootstrap-CLI)

## Akzeptanzkriterien
- [ ] `docker run ghcr.io/kaigothe/davnode:latest` startet auf amd64 und arm64
- [ ] Release-Workflow läuft nur nach erfolgreichem CI; erste Veröffentlichung
      wird vom Maintainer freigegeben
