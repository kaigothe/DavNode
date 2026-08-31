# Offene Fragen

Laufend aktualisierte Liste. Fragen werden hier entfernt (und als
Entscheidung in [01-decisions.md](01-decisions.md) festgehalten), sobald
sie beantwortet sind.

## Datenmodell (Detailphase, M1)
- Blob-Spaltentyp je DB-Engine (Postgres bytea, MySQL LONGBLOB, SQLite
  BLOB) — konkrete TypeORM-Spaltendefinition je Driver

## Später (bewusst zurückgestellt)
- MD5-Digest-Unterstützung für ältere Clients (M10/M11) — v1 nur
  SHA-256
- Token-Introspection (RFC 7662) als Alternative zu JWT/JWKS-Validierung
  (M10) — v1 setzt signierte JWTs voraus
- JIT-Provisioning für OAuth2-Nutzer (M10) — v1 erfordert vorab per
  Admin-API verknüpfte lokale Nutzer
- Nutzer-Self-Service-API (eigenes Passwort ändern, eigenes Profil
  bearbeiten, M9) — v1 der Admin-API ist rein für Admins, die andere
  verwalten
- Soft-Quota/Warnschwellen (z.B. Benachrichtigung bei 80 % Auslastung,
  M8) — v1 kennt nur ein Hard-Limit mit `507`
- `VTODO`/`VJOURNAL`-Unterstützung (nur `VEVENT` in v1, Runde 21) — DUE-
  statt DTSTART/DTEND-Zeitsemantik bräuchte eigene Time-Range-Logik
- iMIP/E-Mail-Fallback für externe (nicht-lokale) Scheduling-Attendees
  (Runde 22) — v1 stellt nur an Attendees auf demselben Tenant zu
- iTIP-Verhandlungsmethoden `COUNTER`/`DECLINECOUNTER`/`ADD` (Runde 22)
- Explizites Scheduling (Client postet eigene iTIP-Einladung an die
  Outbox) — v1 nur implizites Scheduling über PUT/DELETE (Runde 22)
- Opt-out vom automatischen Eintragen eingehender Einladungen in den
  Default-Kalender (Runde 22) — v1 hat kein manuelles Triage-Modell
- Instanz-genaues Scheduling für einzelne Vorkommen wiederkehrender
  Termine (RFC 6638 §5, `RECURRENCE-ID`-scoped) — v1 behandelt
  Einladungsänderungen nur auf Ebene des gesamten CalendarObject
- Locked-Null-Resources (LOCK auf noch nicht existierende Pfade,
  RFC 4918) — bewusst aus M4 ausgeklammert
- Retention/Pruning-Strategie für `collection_changes` (wächst aktuell
  unbegrenzt, M4)
- `expand-property`-REPORT (RFC 3253) — nützlich für Client-Komfort
  (Auflösen von href-wertigen Properties wie `owner` in einem Rutsch),
  aber keine Voraussetzung für eine funktionierende ACL-Engine (M3)
- Umstellung auf Independent-Versioning je Package (z.B.
  semantic-release-Monorepo-Plugin), falls `@davnode/core` künftig
  unabhängig auf npm veröffentlicht werden soll (Runde 17)
- Automatische Veröffentlichung der generierten TypeDoc-API-Doku (z.B.
  GitHub Pages) in CI (Runde 17) — v1 erzeugt die Doku nur lokal auf
  Kommando
- Apple/Google-Client-Besonderheiten sowie Windows-WebDAV-Mini-Redirector
  (→ M11), siehe [06-standards-compliance.md](06-standards-compliance.md)
- Konkrete OAuth2/OIDC-Provider-Kompatibilität (welche Provider getestet
  werden sollen)
- Sharing-Erweiterungen jenseits RFC 3744 (z.B. Apples proprietäre
  Calendar-Sharing-Extension) — bewusst nicht in v1-Zielbild aufgenommen,
  ggf. Teil von M11 oder späterer Phase
