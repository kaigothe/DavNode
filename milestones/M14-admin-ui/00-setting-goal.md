# M14 — Admin-UI

## Setting (Kontext)
M9 lieferte die Admin-REST-API, M13 stellte die Admin-UI zurück
([M13/05-demo-and-admin-ui/03-admin-ui.md](../M13-open-source-launch/05-demo-and-admin-ui/03-admin-ui.md)).
M14 baut sie: eine React-SPA im neuen Workspace-Paket
`packages/admin-ui` (Vite, TypeScript, Ant Design 6), die **ausschließlich**
die dokumentierte Admin-API nutzt und vom Express-Server selbst
ausgeliefert wird.

**Entscheidungen aus der M14-Planung (2026-10-20, mit Kai Gothe):**

1. **Auslieferung durch den Express-Server**, gleicher Origin, kein CORS.
   Abschaltbar über ein Env-Flag, **Default: aus**
   (`DAVNODE_ADMIN_UI_ENABLED`, Mount unter `/admin-ui`). Ohne Flag
   existiert die Route nicht (404) und es wird kein Build-Artefakt gelesen.
2. **Login-Mechanik**: Formular mit Tenant-Slug, Benutzername, Passwort.
   Die Credentials liegen nur in `sessionStorage` und werden als
   `Authorization: Basic …` an jeden Request gehängt. Kein Server-Login-
   Endpoint, keine Cookies (damit kein CSRF). OAuth2/OIDC-Login im Browser
   ist ein möglicher späterer Ausbau, **nicht** Teil von M14.
3. **Backend-Ergänzungen sind erlaubt**; jede Änderung gehört in die
   OpenAPI-Spec (CI prüft Spec ↔ Code).
4. **Umfang**: M13-Umfang (Login, Tenants, Nutzer, Gruppen, Quota,
   Auth-Provider-Anzeige) **plus** Kalender-/Kontakte-Ansicht (lesend),
   Sprachen **de/en**, Theme **System / Hell / Dunkel**.

**Annahmen, die Kai Gothe bestätigen/korrigieren soll** (Empfehlung steht
jeweils dabei):

- *Auth-Provider „ein/aus“*: Provider werden per Env konfiguriert
  (`DAVNODE_AUTH_PROVIDERS`). Ein Laufzeit-Schalter wäre ein Eingriff in
  den Auth-Stack. **Empfehlung:** M14 zeigt den Provider-Status nur an
  (read-only); Umschalten bleibt Konfiguration.
- *Datenschutz Kalender/Kontakte*: Admins lesen fremde Inhalte.
  **Empfehlung:** eigenes Flag `DAVNODE_ADMIN_UI_CONTENT_VIEW` (Default
  aus, setzt `DAVNODE_ADMIN_UI_ENABLED` voraus), jeder Zugriff wird
  geloggt, strikt read-only.
- *Listen*: Admin-Listen sind derzeit unpaginiert. **Empfehlung:**
  abwärtskompatible Ergänzung `limit`/`offset`/`q`.

## Ziel
Ein `server_admin` bzw. `tenant_admin` verwaltet Tenants, Nutzer, Gruppen
und Quota komplett im Browser, sieht Provider-Status und (optional)
Kalender/Kontakte eines Nutzers — ohne `curl`. Die UI ist zweisprachig,
barrierearm, mit System/Hell/Dunkel-Theme und standardmäßig abgeschaltet.

## Stand
- ✅ 1 Backend-Ergänzungen, ✅ 2 Auslieferung & Flag, ✅ 3 UI-Fundament
- 🔶 4 Shell/Auth/i18n/Theme: Login, rollenabhängige Shell, de/en,
  System/Hell/Dunkel und Übersichtsseite sind fertig; die Seiten kommen
  mit Aufgabe 5 und 6.
- ✅ 5 Verwaltungsansichten (Nutzer, Gruppen, Speicher, Tenants; die
  Provider-Anzeige liegt auf der Übersichtsseite)
- ⏳ 6–8 offen.

## Große Aufgaben (Übersicht)
1. [Backend-Ergänzungen](01-backend-additions/00-overview.md)
2. [Auslieferung & Flag](02-serving-and-flag/00-overview.md)
3. [UI-Fundament](03-ui-foundation/00-overview.md)
4. [Shell, Auth, i18n, Theme](04-shell-auth-i18n-theme/00-overview.md)
5. [Verwaltungsansichten](05-management-views/00-overview.md)
6. [Kalender-/Kontakte-Ansicht](06-calendar-contacts-views/00-overview.md)
7. [Qualität](07-quality/00-overview.md)
8. [Doku, Screenshots, Demo](08-docs-and-demo/00-overview.md)

Empfohlene Reihenfolge: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (1–2 sind
Voraussetzung, 3 kann parallel zu 1–2 beginnen; 6 hängt an 1).

## Referenzen
- [docs/admin-api.openapi.yaml](../../docs/admin-api.openapi.yaml)
- [M9 — Admin-API](../M9-admin-api/00-setting-goal.md)
- [packages/server/src/http/security-headers.middleware.ts](../../packages/server/src/http/security-headers.middleware.ts) — CORS bewusst aus, CSP
