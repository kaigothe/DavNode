# Sub-Task: Well-Known-Redirect-Handler

## Kontext
RFC 6764. Liegt **außerhalb** des `/dav/{tenant}/...`-Präfixes — kann
daher nicht die reguläre Tenant-Resolution-Middleware aus M2
unverändert nutzen (siehe Konflikt-Auflösung in
[00-setting-goal.md](../00-setting-goal.md) bzw.
[planning/01-decisions.md](../../../planning/01-decisions.md) Runde 26).

## Aufgabe
- `packages/server/src/http/routes/well-known.route.ts`: behandelt
  `GET`/`PROPFIND` auf `/.well-known/caldav` und `/.well-known/carddav`
- Verlangt Basic Auth (unabhängig von den in M10 konfigurierten
  zusätzlichen Schemes — Discovery-Clients erwarten i.d.R. Basic an
  dieser Stelle) über eine **eigene** kleine Tenant-Auflösung:
  1. `DAVNODE_DEFAULT_TENANT` gesetzt? → dieser Tenant wird verwendet,
     `username` im `Authorization`-Header wird direkt dagegen geprüft
  2. Sonst: `username` muss dem Format `user@tenantSlug` entsprechen —
     wird in `tenantSlug` + `username` zerlegt; falscher Format ohne
     `@` → `400`
  3. Tenant/Nutzer nicht auflösbar → `401` (kein Unterschied zu
     "falsches Passwort", kein Informationsleck)
- Bei erfolgreicher Auflösung: `302 Found` mit `Location`-Header auf
  die Principal-URL des Nutzers
  (`/dav/{tenantSlug}/principals/users/{userId}`) — **nicht** direkt
  auf `calendar-home-set`/`addressbook-home-set` (Client löst das
  selbst per PROPFIND auf die Principal-URL auf, RFC6764 §6)

## Akzeptanzkriterien
- [ ] Mit konfiguriertem `DAVNODE_DEFAULT_TENANT`: `curl` mit
      Basic-Auth-Credentials `username:password` (ohne `@`) auf
      `/.well-known/caldav` liefert `302` auf die korrekte
      Principal-URL
- [ ] Ohne Default-Tenant: `username@tenantSlug`-Format löst korrekt
      auf den jeweiligen Tenant/Nutzer auf
- [ ] Unbekannter Tenant/Nutzer liefert `401`, kein Unterschied zur
      "falsches Passwort"-Antwort
- [ ] `/.well-known/carddav` liefert dieselbe Principal-URL wie
      `/.well-known/caldav` (beide führen zum selben Nutzer-Principal,
      der Client liest dort sowohl `calendar-home-set` als auch
      `addressbook-home-set` aus)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 26
