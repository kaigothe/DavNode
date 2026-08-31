# Sub-Task: Router-Setup & Mounting

## Kontext
`@davnode/admin-api` darf laut
[planning/04-architecture.md](../../../planning/04-architecture.md)
**nicht** von `@davnode/server` abhängen (Abhängigkeitsrichtung: beide
hängen nur von `core` ab). Die Wiederverwendung der Tenant-Resolution-/
Basic-Auth-Middleware aus M2 passiert deshalb **in** `server`, nicht in
`admin-api` selbst.

## Aufgabe
- `packages/admin-api/package.json`: `express` als Dependency ergänzen
  (Router-Typ), weiterhin **keine** Abhängigkeit zu `@davnode/server`
- `packages/admin-api/src/router.ts`: exportiert einen
  `express.Router()`; **Vertrag**: geht davon aus, dass `req.tenant`
  und `req.principal` bereits gesetzt sind (durch die Middleware-Kette,
  die `server` davor einhängt) — keine eigene Auth-Logik in `admin-api`
- `packages/server/src/app.ts` (M2) erweitern: mountet den
  `admin-api`-Router unter `/admin`, **nach** derselben
  Tenant-Resolution- und Basic-Auth-Middleware-Kette wie die DAV-Routen
  (Wiederverwendung derselben Middleware-Instanzen, nicht Duplikate)
- Konsistentes JSON-Error-Envelope für alle Admin-API-Fehler:
  `{ "error": { "code": "...", "message": "..." } }` — genutzt von allen
  folgenden Großen Aufgaben, hier als gemeinsames Error-Handling-
  Middleware für den `/admin`-Zweig definiert

## Akzeptanzkriterien
- [ ] `packages/admin-api` kompiliert ohne Abhängigkeit zu
      `@davnode/server` (Grep-Check auf `package.json`)
- [ ] Ein Request an `/admin/{tenantSlug}/...` ohne gültige Basic-Auth-
      Credentials liefert `401` mit korrektem `WWW-Authenticate`-Header
      (dieselbe Middleware wie bei DAV-Routen greift nachweislich auch
      hier)
- [ ] Ein Fehler in einer Admin-Route liefert das definierte
      JSON-Error-Envelope, keinen Stacktrace

## Referenzen
- [planning/04-architecture.md](../../../planning/04-architecture.md)
