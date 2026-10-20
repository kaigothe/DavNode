# Sub-Task: Compose-Release-Asset

## Aufgabe
- `docker-compose.prod.yml` + `.env.prod.example` + `Caddyfile` verweisen
  auf das GHCR-Image statt `build:`; als Release-Asset (zip) anhängen
- Quickstart im README nutzt das Image (kein `--build`)
- Upgrade-Befehl dokumentieren (`pull` + Neustart, Migrationen laufen
  beim Start — M12)

## Akzeptanzkriterien
- [ ] Frische VM: Quickstart ohne Repo-Clone in ≤ 5 Minuten lauffähig (gemessen)
