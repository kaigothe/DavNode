# Roadmap / Meilensteine (Vorschlag)

Das in [00-overview.md](00-overview.md) beschriebene Zielbild ist sehr
umfangreich (volles RFC3744-ACL + Locking + Sync-Token + Scheduling + Quota
+ Multi-Tenancy + Gruppen + Admin-API + Konformitätstests). Um es "Schritt
für Schritt mit Claude Code" umsetzbar zu machen, wird es hier in
Meilensteine zerlegt. Jeder Meilenstein soll ein lauffähiges, testbares
Zwischenergebnis liefern.

**Status: bestätigt (2026-08-30) — Reihenfolge/Schnitt wie unten beschrieben.**

Begründung der Grundidee: erst eine minimale, aber echte Ende-zu-Ende-Kette
(Auth → WebDAV-Dateizugriff) zum Laufen bringen, danach Schicht für Schicht
Standardtiefe ergänzen (ACL → Locking/Sync → CardDAV → CalDAV → Scheduling
→ Quota → Admin-API → weitere Auth-Provider → Client-Kompatibilität →
Hardening).

---

> Konkrete, für Claude Code ausführbare Aufgaben je Meilenstein liegen unter
> `milestones/<Meilenstein>/`. Fertig ausgearbeitet:
> [M0-fundament](../milestones/M0-fundament/00-setting-goal.md),
> [M1-kern-datenmodell-tenancy](../milestones/M1-kern-datenmodell-tenancy/00-setting-goal.md),
> [M2-webdav-core](../milestones/M2-webdav-core/00-setting-goal.md),
> [M3-webdav-acl](../milestones/M3-webdav-acl/00-setting-goal.md),
> [M4-locking-sync](../milestones/M4-locking-sync/00-setting-goal.md),
> [M5-carddav](../milestones/M5-carddav/00-setting-goal.md),
> [M6-caldav](../milestones/M6-caldav/00-setting-goal.md),
> [M7-caldav-scheduling](../milestones/M7-caldav-scheduling/00-setting-goal.md),
> [M8-quota](../milestones/M8-quota/00-setting-goal.md),
> [M9-admin-api](../milestones/M9-admin-api/00-setting-goal.md),
> [M10-extended-auth](../milestones/M10-extended-auth/00-setting-goal.md),
> [M11-client-compatibility](../milestones/M11-client-compatibility/00-setting-goal.md),
> [M12-hardening](../milestones/M12-hardening/00-setting-goal.md).
>
> **Damit ist die gesamte Roadmap (M0–M12) vollständig in
> ausführbare Aufgaben heruntergebrochen.**

## M0 — Projekt-Fundament
- Monorepo-Struktur (Core-Library / Server-Wrapper / ggf. Admin-API als
  eigenes Package)
- TypeScript strict, Lint/Format-Setup, Test-Framework
- TypeORM-Grundkonfiguration + Migrations-Workflow, Testmatrix Postgres/
  SQLite/MySQL
- Docker/Docker-Compose-Grundgerüst
- CI-Pipeline-Grundgerüst (Lint + Tests)
- Lizenzwahl (Open Source)

## M1 — Kern-Datenmodell & Multi-Tenancy-Fundament
- Entities: Tenant, User, Group, Principal
- `tenant_id`-Konvention in den Basis-Entities
- Principal-URL-Struktur (RFC3744-Grundlage)
- Erster Auth-Provider: Basic Auth (einfachster Einstieg), Auth-Interface
  pluggable angelegt

## M2 — WebDAV Core (Class 1)
- Generische Resource-/Collection-Hierarchie im Datenmodell
- Ressourceninhalte als Blob in der DB
- PROPFIND/PROPPATCH, GET/PUT/DELETE/MKCOL/COPY/MOVE
- ETag-Handling
- Referenz: litmus-Basistests (Class-1-Teil)

## M3 — WebDAV ACL (RFC 3744)
- Principals-Collection, Privilege-Modell, ACEs (grant/deny)
- Gruppen-Principals + Mitgliedschaft
- Zentrale Rechteprüfung (Middleware/Service in der Core-Engine)

## M4 — Locking (Class 2) & Sync (RFC 6578)
- LOCK/UNLOCK, Lock-Tokens, Timeout-Handling
- sync-collection REPORT, Change-Tracking/Sync-Token pro Collection
- Referenz: litmus-Locking-Tests

## M5 — CardDAV (RFC 6352)
- Addressbook-Collections, vCard-Objekte
- addressbook-query / addressbook-multiget REPORT
- Referenz: CardDAVtester

## M6 — CalDAV-Grundfunktion (RFC 4791)
- Calendar-Collections, iCalendar-Objekte
- calendar-query / calendar-multiget REPORT, free-busy-query
- Referenz: CalDAVtester (ohne Scheduling-Teil)
- **ICS-Feed-Export pro Kalender** (aggregierte, read-only `.ics`-URL für
  Internet-Kalender-Abos, z.B. Outlook — siehe Entscheidung Runde 14)

## M7 — CalDAV Scheduling (RFC 6638)
- Scheduling-Inbox/Outbox pro Kalender-Principal
- iTIP-Verarbeitung (Einladungen, Antworten, Frei/Belegt)
- Referenz: CalDAVtester Scheduling-Teil

## M8 — Quota-Durchsetzung
- Speicherplatz-Tracking pro Nutzer/Mandant
- Limit-Prüfung beim Schreiben, 507-Insufficient-Storage-Antwort

## M9 — Admin-/Management-API
- Verwaltungs-Schicht für Nutzer/Gruppen/Mandanten/Quota
- Nutzt dieselben Services/Repositories wie die DAV-Schicht

## M10 — Erweiterte Auth-Provider
- Digest Auth
- OAuth2/Bearer-Token
- Validiert das pluggable Auth-Interface anhand zweier realer Provider

## M11 — Client-Kompatibilität (Apple/Google/Microsoft-Besonderheiten)
- Gezieltes Nachrüsten bekannter Client-Quirks (z.B. Apple ctag-Verhalten,
  Google-CalDAV-Eigenheiten, Windows-WebDAV-Mini-Redirector)
- Reale Client-Tests: Apple Calendar/Contacts, Thunderbird, DAVx5, ggf.
  Outlook, Windows Explorer

## M12 — Hardening & Produktionsreife
- Docker-Compose-Referenz-Deployment
- Observability/Logging
- Backup-Strategie für DB-Blob-Storage
- Security-Review
- Dokumentation

