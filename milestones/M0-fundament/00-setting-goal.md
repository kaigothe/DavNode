# M0 — Projekt-Fundament

## Setting (Kontext)
DavNode ist ein Open-Source WebDAV/CalDAV/CardDAV-Server (Node.js,
TypeScript, Express, TypeORM) — siehe [planning/00-overview.md](../../planning/00-overview.md).
Bevor irgendeine DAV-Protokoll-Logik entsteht, braucht das Projekt ein
tragfähiges technisches Fundament: Monorepo-Struktur, Sprach-/Test-/
Lint-Tooling, Datenbank-Anbindung über TypeORM, Docker-Setup und CI.
M0 legt dieses Fundament — **ohne** fachliche DAV-Logik.

## Ziel
Am Ende von M0 existiert ein leeres, aber lauffähiges, getestetes und
CI-abgesichertes Monorepo mit drei Packages (`@davnode/core`,
`@davnode/server`, `@davnode/admin-api`), das sich per Docker bauen und
starten lässt und mit allen drei Ziel-Datenbanken (PostgreSQL, SQLite,
MySQL/MariaDB) über TypeORM verbinden kann. Es gibt noch **keine**
WebDAV/CalDAV/CardDAV-Funktionalität — das beginnt ab M1/M2.

## Große Aufgaben (Übersicht)
1. [Monorepo-Scaffold](01-monorepo-scaffold/00-overview.md)
2. [TypeScript, Linting, Testing](02-typescript-linting-testing/00-overview.md)
3. [TypeORM & Datenbank-Setup](03-typeorm-database-setup/00-overview.md)
4. [Docker-Setup](04-docker-setup/00-overview.md)
5. [CI-Pipeline](05-ci-pipeline/00-overview.md)
6. [Code-Dokumentation (TypeDoc)](06-code-documentation/00-overview.md) — nachträglich ergänzt, Runde 17
7. [Changelog & Release-Automatisierung (semantic-release)](07-changelog-release-automation/00-overview.md) — nachträglich ergänzt, Runde 17

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→7), da spätere
Aufgaben auf früheren aufbauen (z.B. braucht die CI-Pipeline lauffähige
Lint-/Test-/Docker-Scripts aus den Aufgaben 1–4; Aufgabe 6 baut auf der
ESLint-Konfiguration aus Aufgabe 2 auf; Aufgabe 7 ergänzt die CI-Pipeline
aus Aufgabe 5 um einen Release-Job).

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M0-Definition
- [planning/04-architecture.md](../../planning/04-architecture.md) — Repo-/Package-Struktur
- [planning/07-coding-conventions.md](../../planning/07-coding-conventions.md) — TSDoc-Pflicht, Commit-/Release-Konvention
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runden 1, 3, 5, 6, 7, 9, 17 (Techstack- und Tooling-Entscheidungen)

## Abgrenzung (nicht Teil von M0)
- Kein Datenmodell (Tenant/User/Principal/...) — das ist M1
- Keine HTTP-Routen/DAV-Methoden — ab M2
- Keine Auth-Provider-Implementierung — ab M1 (Basic Auth als erster Provider)
