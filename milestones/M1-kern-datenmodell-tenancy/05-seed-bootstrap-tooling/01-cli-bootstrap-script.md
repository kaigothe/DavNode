# Sub-Task: CLI-Bootstrap-Skript

## Kontext
Ohne Admin-API (kommt erst M9) gibt es sonst keinen Weg, einen ersten
Tenant/User anzulegen, um die restlichen Meilensteine (ab M2) manuell
oder per Integrationstest gegen echte Daten zu prüfen.

## Aufgabe
- `packages/core/src/cli/bootstrap.ts`: nutzt
  [TenantService](../04-repository-service-layer/01-tenant-service.md)
  und [UserService](../04-repository-service-layer/02-user-service.md),
  um einen Tenant + einen ersten User anzulegen
- Aufruf über ein npm-Script im Root, z.B.
  `npm run bootstrap -- --tenant-slug=acme --tenant-name="Acme Inc" --username=admin --email=admin@example.com --password=...`
  (Parameter via einfachem CLI-Arg-Parsing, keine externe Library nötig
  für diesen Umfang)
- Idempotenz: läuft das Skript ein zweites Mal mit demselben
  `tenant-slug`, gibt es eine klare Fehlermeldung ("Tenant existiert
  bereits") statt eines rohen DB-Fehlers oder eines Duplikats
- Kurze Doku im `packages/core/README.md`, wie das Skript lokal und im
  Docker-Container (`docker compose exec app npm run bootstrap -- ...`)
  aufgerufen wird

## Akzeptanzkriterien
- [ ] Skript legt Tenant, Sonder-Principals, User, Principal und
      Credential in einem Durchlauf an (End-to-End-Test oder manuelle
      Verifikation gegen SQLite)
- [ ] Zweiter Aufruf mit demselben Slug bricht kontrolliert mit
      verständlicher Fehlermeldung ab
- [ ] Passwort wird nicht als Klartext-Argument geloggt (z.B. `ps aux`-
      Sichtbarkeit als bekannte Grenze im README erwähnen; für v1
      ausreichend, da nur für lokale Entwicklung/Bootstrap gedacht)

## Nachtrag (Runde 23/24)
Zwischen M8 und M9 hat sich dieser Punkt zweimal verändert — hier steht
der **finale** Zielzustand, damit bei der tatsächlichen Umsetzung nicht
zwei Zwischenschritte nacheinander gebaut werden müssen:
- Sobald [M8 — Quota](../../M8-quota/00-setting-goal.md) existiert
  (genauer: sobald `User.isAdmin` als Feld existiert), aber
  [M9 — Admin-API](../../M9-admin-api/00-setting-goal.md) **noch
  nicht**: Bootstrap setzt `isAdmin = true` (Runde 23,
  Übergangs-Platzhalter)
- Sobald **auch** M9 existiert: Bootstrap setzt stattdessen
  `role = 'server_admin'` (Runde 24, siehe
  [M9-Role-Migration](../../M9-admin-api/01-role-model/01-role-migration-and-retrofits.md)) —
  `isAdmin` existiert dann nicht mehr
- Wird die gesamte Roadmap linear von M0 bis M9+ umgesetzt (Normalfall),
  reicht es, direkt den M9-Endzustand (`role = 'server_admin'`) zu
  bauen und den `isAdmin`-Zwischenschritt zu überspringen

## Referenzen
- [planning/02-roadmap.md](../../../planning/02-roadmap.md) — M9-Abgrenzung
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 23, 24
