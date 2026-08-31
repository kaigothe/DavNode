# Projekt-Übersicht: DavNode

## Vision
Ein moderner, Open-Source WebDAV-Server mit CalDAV- und CardDAV-Erweiterung und
nutzerbasierten ACLs. Der Fokus liegt zunächst auf einer sauberen, korrekten
Umsetzung der offenen Standards (WebDAV/CalDAV/CardDAV RFCs). Client-spezifische
Besonderheiten und Erweiterungen (Apple Calendar/Contacts, Google, Microsoft)
werden als spätere Phase berücksichtigt, um maximale Kompatibilität zu
gängigen DAV-Clients zu erreichen.

## Zielsetzung
- **Einsatzspektrum**: skaliert von privaten Projekten (Selbsthosting für
  Einzelpersonen/Familien) bis hin zu einer Grundlage für andere Open-Source-
  Software bzw. den Einsatz in mittelständischen Unternehmen.
- **Standards-first**: Primär korrekte Implementierung der offiziellen
  Spezifikationen (WebDAV, ACL-Erweiterung, CalDAV, CardDAV). Client-Quirks
  (Apple/Google/Microsoft) folgen in einer späteren Ausbaustufe.
- **Wiederverwendbarkeit**: Soll so gebaut sein, dass er als Basis/Baustein für
  andere Open-Source-Projekte dienen kann (→ Architektur-Frage: Library vs.
  monolithischer Server, siehe [01-decisions.md](01-decisions.md)).

## Funktionsumfang (Zielbild v1)
Sehr umfangreiches Vollpaket — siehe [01-decisions.md](01-decisions.md) für
Details und Begründungen:
- **WebDAV**: generische Dateiablage, Class 2 (inkl. LOCK/UNLOCK-Locking)
- **WebDAV Sync** (RFC 6578): sync-collection REPORT / Sync-Token für
  effizientes Client-Sync
- **CalDAV**: Kalender-Synchronisation (RFC 4791) inkl. **Scheduling**
  (RFC 6638, iTIP-Einladungen, Scheduling-Inbox/Outbox)
- **CardDAV**: Kontakt-Synchronisation (RFC 6352)
- **ACL**: volle RFC 3744-Umsetzung (Principals, Nutzer- **und**
  Gruppen-Principals, granulare Privileges, ACEs)
- **Multi-Tenancy**: shared Schema mit `tenant_id`, von Anfang an im
  Datenmodell verankert
- **Quota**: Speicherplatz-Limits pro Nutzer/Mandant im Datenmodell vorgesehen
- **Admin-/Management-API**: Verwaltung von Nutzern/Gruppen/Mandanten/Quota,
  nutzt dieselben Services wie die DAV-Schicht
- **Erweiterbarkeit**: definierte Hook-/Extension-Points (z.B. externe
  Auth-Provider, Storage-Quotas, Virus-Scan, Custom Properties)

> **Hinweis zur Umsetzung**: Dieses Zielbild ist bewusst umfangreich. Die
> tatsächliche Bau-Reihenfolge wird in einer separaten Roadmap in
> sinnvolle Meilensteine unterteilt (→ [02-roadmap.md](02-roadmap.md)).

## Techstack (festgelegt)
- **Runtime**: Node.js
- **HTTP-Framework**: Express.js
- **ORM**: TypeORM — bewusst gewählt wegen DB-Unabhängigkeit
  (Datenbanksystem soll austauschbar sein)
- **Sprache**: TypeScript (strict-Modus), durchgehend in Core-Library und Server
- **Deployment**: Docker-Container (self-hosted)
- **Architektur**: Core-Library (DAV-Protokoll, ACL-Engine, Repositories,
  Hook-Points) getrennt von einem dünnen Express-Server-Wrapper

## Nicht-Ziele (bisher)
- Kein spezifisches Vorbild-Projekt (kein Klon von Radicale/Baïkal/SabreDAV/
  Nextcloud) — eigenständiges Konzept.

## Planungsdokumente
- [01-decisions.md](01-decisions.md) — Entscheidungsprotokoll (ADR-artig)
- [02-roadmap.md](02-roadmap.md) — Meilensteine, mit denen das Zielbild
  schrittweise umgesetzt wird
- [03-open-questions.md](03-open-questions.md) — offene Fragen, laufend
  aktualisiert
- [04-architecture.md](04-architecture.md) — Repo-/Package-Struktur,
  Schichtung, Auth-Interface-Split
- [05-data-model.md](05-data-model.md) — Kern-Entitäten je Domäne
  (Tenancy, WebDAV, Calendar, Addressbook), ACE/Lock/Sync-Muster
- [06-standards-compliance.md](06-standards-compliance.md) — RFC-Matrix je
  Meilenstein, Hinweise zur Apple/Google/Microsoft-Kompatibilität
- [07-coding-conventions.md](07-coding-conventions.md) — Sprache,
  TSDoc-Pflicht, Doc-Generierung, Commit-/Release-Konvention
- Weitere Dokumente folgen: ACL-Privilege-Katalog im Detail
