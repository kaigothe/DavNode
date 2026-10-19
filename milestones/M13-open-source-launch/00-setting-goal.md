# M13 — Open-Source-Launch & Sichtbarkeit

## Setting (Kontext)
M0–M12 haben einen vollständigen, konformen und betreibbaren Server
geliefert. M13 baut **keine neuen DAV-Protokollfunktionen**, sondern macht
DavNode **auffindbar, ausprobierbar und vertrauenswürdig** — zuerst für
Self-Hoster und Node.js-Entwickler (Open Source), danach für Firmen und
IT-Dienstleister (Software-Unternehmen / Support-Angebot).

Ausgangspunkt ist eine Bewertung durch ChatGPT (ohne Einsicht in den Code)
plus ein Abgleich mit dem tatsächlichen Repo-Stand:

| Empfehlung                              | Stand im Repo                                                    |
| --------------------------------------- | ---------------------------------------------------------------- |
| README, Lizenz (AGPL-3.0), CONTRIBUTING | vorhanden                                                        |
| Sicherheitsrichtlinie / Meldeweg        | **fehlt** (kein SECURITY.md)                                     |
| Code of Conduct, Issue-/PR-Templates    | **fehlen**                                                       |
| Dependabot, Code Scanning               | **fehlen** (nur ci.yml, restore-test.yml)                        |
| Docker-Image / npm-Paket                | **nicht veröffentlicht** (`private: true`, `npmPublish: false`)  |
| Getestete Clients, Kompatibilitätsmatrix | nur Standards/Suites; README: „nicht mit echten Geräten getestet“ |
| Admin-Panel / Screenshot                | **existiert nicht** — nur REST-Admin-API                         |
| Backup-, Update-, Restore-Anleitung     | Backup vorhanden (M12); Upgrade-/Migrationsanleitung fehlt       |
| Abgrenzung zu Nextcloud/Radicale/Baïkal | fehlt                                                            |
| Support-/Wartungsmodell                 | fehlt                                                            |

## Scope-Entscheidungen
- **Primäre Zielgruppe zuerst: Self-Hoster** (Docker-Image, einfache
  Installation). Node-Entwickler (npm-Bibliothek) sind Zielgruppe 2,
  Unternehmen Zielgruppe 3. Begründung: Docker-Weg ist bereits fertig
  dokumentiert; `@davnode/*` als Bibliothek braucht stabile API-Zusagen.
- **Ehrlichkeit vor Marketing**: Statusangaben („getestet mit …“) nur mit
  Beleg; keine „production ready“-Aussage ohne Tests an echten Clients.
- **Metriken**: Installationen/Image-Pulls, getestete Clients, gelöste
  Issues, wiederkehrende Nutzer — nicht GitHub-Sterne.
- **Alles Öffentliche ist freigabepflichtig**: Veröffentlichung (Image,
  npm, Posts, Verzeichnis-Einträge) löst Kai Gothe selbst aus; M13
  bereitet vor und liefert Entwürfe.

## Offene Entscheidungen (vor Start klären)
1. **Admin-UI**: eigenes minimales Web-Panel bauen (Aufgabe 5, groß) oder
   zunächst nur OpenAPI-Spec + CLI? Empfehlung: OpenAPI + minimale
   Read/Write-UI als eigenes Paket `@davnode/admin-ui`, erst nach Aufgabe 1–4.
2. **Lizenzmodell für Firmen**: AGPL-3.0 beibehalten und Dual-Licensing/CLA
   offenhalten? Empfehlung: DCO jetzt einführen, CLA erst bei konkretem
   kommerziellen Bedarf (Rechtsberatung).
3. **npm**: Bibliothek veröffentlichen oder nur Docker? Empfehlung: nur
   Docker im Launch, npm später.

## Ziel
Ein Fremder versteht in unter einer Minute, was DavNode ist, startet es in
unter fünf Minuten per Docker, sieht welche Clients belegt funktionieren,
findet Sicherheits- und Support-Informationen — und das Projekt ist in den
relevanten Self-Hosting-Verzeichnissen und Communities vorgestellt.

## Große Aufgaben (Übersicht)
1. [Repository-Auftritt & Positionierung](01-repository-presentation/00-overview.md)
2. [Community- & Vertrauensdateien](02-community-and-trust/00-overview.md)
3. [Veröffentlichung & Installation](03-distribution/00-overview.md)
4. [Reale Client-Verifikation](04-real-client-verification/00-overview.md)
5. [Demo & Admin-Oberfläche](05-demo-and-admin-ui/00-overview.md)
6. [Dokumentationsseite](06-documentation-site/00-overview.md)
7. [Unternehmens-Readiness & Support-Modell](07-enterprise-readiness/00-overview.md)
8. [Ankündigung & Feedback-Schleife](08-launch-and-feedback/00-overview.md)

Empfohlene Reihenfolge: 2 → 3 → 1 → 4 → 6 → 5 → 7 → 8. Aufgaben 1–4 sind
Voraussetzung für 8; 4 (echte Clients) kann parallel laufen und braucht
Geräte/Tester.

## Abgrenzung (nicht Teil von M13)
- Keine neuen DAV-Features, keine Performance-Arbeit
- Kein Hosting-/SaaS-Angebot, keine Preisliste, keine SLAs
- Keine bezahlte Werbung
- Kein Multi-Instance-/Kubernetes-Support

## Umsetzungsstand (2026-10-19)
Entscheidungen 1–3 wurden mit den jeweiligen Empfehlungen getroffen
(OpenAPI + Demo zuerst, **Admin-UI zurückgestellt**; AGPL + DCO, keine CLA;
nur Docker, **npm zurückgestellt**).

**Umgesetzt im Repo:** Aufgaben 1, 2 (Dateien/Workflows), 3 (Workflows,
Bundle — noch nicht ausgeführt), 5 (OpenAPI mit Contract-Test, Demo),
6 (VitePress-Seite, Upgrade-Test, Migrationsskript, Handbuch), 7 und 8
(Entwürfe unter `docs/`, `docs/launch/`).

**Nur der Maintainer kann** (siehe `docs/launch/README.md`): GitHub-
Einstellungen (Discussions, Private Vulnerability Reporting, Pages auf
„GitHub Actions“, Environment `container-release` mit Reviewer, Topics/
Social Preview, Branch Protection), erste Veröffentlichung des Images,
Kontaktadresse in CODE_OF_CONDUCT/Support, Tests auf echten Geräten und
Tester-Aufruf (Aufgabe 4), jede öffentliche Ankündigung.

**Bei der Umsetzung gefunden:**
- **Durchsatz**: jeder authentifizierte Request verifiziert das Passwort
  (argon2id, kein Cache): ~27 ms Mehrkosten, ca. 20–35 Requests/s auf einem
  Laptop (`scripts/loadtest/run.mjs`). Dokumentiert im Handbuch; ein
  Credential-Cache wäre ein Kandidat für M14 (sicherheitsrelevant, daher
  nicht ungefragt eingebaut).
- Kein Audit-Log, keine Verschlüsselung at rest — im Faktenblatt genannt.
