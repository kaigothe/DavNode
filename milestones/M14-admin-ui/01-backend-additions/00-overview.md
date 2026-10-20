# Große Aufgabe: Backend-Ergänzungen

## Ziel
Die Admin-API bekommt, was eine UI braucht und bisher fehlt. Jede Route
wird in [docs/admin-api.openapi.yaml](../../../docs/admin-api.openapi.yaml)
dokumentiert (CI prüft Spec ↔ Code, `openapi.test.ts`).

## Sub-Tasks
1. **`GET /admin/{tenantSlug}/me`** — liefert `id`, `username`, `role`,
   `tenant` (Slug, Name) des authentifizierten Nutzers. Dient dem Login-Check
   und der rollenabhängigen Navigation. Erreichbar für **jede** Rolle
   (auch `member`), damit die UI „kein Admin“ sauber melden kann.
2. **Pagination/Suche der Listen** (`/tenants`, `/users`, `/groups`):
   optionale Query-Parameter `limit` (Default/Max festlegen), `offset`, `q`;
   Response ergänzt `total`. Ohne Parameter bleibt das Verhalten
   rückwärtskompatibel (Spec-Version bleibt kompatibel, Minor-Bump).
3. **`GET /admin/{tenantSlug}/providers`** — read-only Status der
   konfigurierten Auth-Provider (Basic/Digest/OAuth2, Issuer-Liste, kein
   Secret). Braucht `AdminRouterOptions` eine neue Option.
4. **Read-only Inhalts-Endpoints** (nur wenn `DAVNODE_ADMIN_UI_CONTENT_VIEW`
   aktiv, sonst 404; Rolle `tenant_admin`, Tenant-Match wie bei Users):
   - `GET /users/{userId}/calendars`, `GET /users/{userId}/calendars/{calendarId}/events?from&to`
   - `GET /users/{userId}/addressbooks`, `GET /users/{userId}/addressbooks/{bookId}/contacts?limit&offset&q`
   - Antworten sind geparste, UI-taugliche JSON-Projektionen (Titel, Zeiten,
     Ort, RRULE-expandierte Instanzen im Zeitfenster; Name, E-Mail, Telefon,
     Organisation), **kein** Roh-iCal/vCard als Pflicht (optional `raw`).
   - Jeder Zugriff wird mit Admin-ID, Ziel-User, Ressource geloggt.

## Akzeptanzkriterien
- [ ] Alle neuen Routen in der OpenAPI-Spec, `openapi.test.ts` grün
- [ ] Rollen-/Tenant-Tests je Route (`member` 403, fremder `tenant_admin` 403)
- [ ] Listen ohne Parameter liefern dasselbe wie vorher
- [ ] Inhalts-Endpoints mit Flag aus → 404; mit Flag an → Zugriff geloggt
- [ ] Keine Secrets (Hashes, Client-Secrets) in irgendeiner Antwort

## Hinweise
- Neue Services/Queries gehören nach `core`, die Routen nach `admin-api`
  (Muster: `registerXRoutes(router, dataSource, options)` in
  [router.ts](../../../packages/admin-api/src/router.ts)).
- Kalender-Expansion über die bestehenden M6-Bausteine
  (`expand-recurrence`, `calendar-data-expand`) wiederverwenden.
