# M4 — Locking (Class 2) & Sync (RFC 6578)

## Setting (Kontext)
M2 hat WebDAV Class 1 gebaut, M3 die vollständige RFC-3744-ACL-Engine.
M4 ergänzt zwei bisher bewusst ausgeklammerte Teile: **Locking** (WebDAV
Class 2 — LOCK/UNLOCK) und **Sync** (RFC 6578 — effizientes
Client-Sync über Sync-Token). Beide bauen auf bereits vorhandener
Infrastruktur auf:
- Die `syncSeq`-Zähler und `collection_changes`-Einträge werden bereits
  seit M2 bei jeder mutierenden Operation mitgeschrieben (bewusste
  Vorarbeit, siehe
  [milestones/M2-webdav-core/06-resource-crud/00-overview.md](../M2-webdav-core/06-resource-crud/00-overview.md))
  — M4 baut "nur" noch den `sync-collection`-REPORT-Endpunkt darauf.
- Der generische REPORT-Dispatcher aus M3
  ([06-principals-and-report-infrastructure](../M3-webdav-acl/06-principals-and-report-infrastructure/02-generic-report-dispatcher.md))
  wird für `sync-collection` wiederverwendet, nicht neu gebaut.

**Locking-Architekturprinzip**: analog zur ACE-Vererbung aus M3 (eine
ACE auf einer Collection gilt automatisch für alle Kinder) gilt auch ein
Lock mit `Depth: infinity` auf einer Collection automatisch für alle
Nachfahren — **ohne** dass dafür in `file_locks` eine Zeile pro
Nachfahre angelegt wird. Ob eine Ressource gesperrt ist, wird zur
Prüfzeit durch Aufsteigen zur Wurzel ermittelt (dieselbe Technik wie
`collect-aces.ts` aus M3, hier für Locks). Das hält die Locking-Tabellen
klein, auch wenn große Collections gesperrt werden.

## Ziel
Am Ende von M4 unterstützt DavNode WebDAV Class 2 vollständig (LOCK,
UNLOCK, Lock-Tokens im `If`-Header bei mutierenden Methoden
durchgesetzt) und Clients können per `sync-collection`-REPORT nur die
Änderungen seit ihrem letzten Sync abrufen, statt jedes Mal die gesamte
Collection neu zu laden.

## Große Aufgaben (Übersicht)
1. [Lock-Entities](01-lock-entities/00-overview.md)
2. [Lock-Evaluation](02-lock-evaluation/00-overview.md)
3. [LOCK-Methode](03-lock-method/00-overview.md)
4. [UNLOCK-Methode](04-unlock-method/00-overview.md)
5. [Lock-Enforcement-Middleware](05-lock-enforcement-middleware/00-overview.md)
6. [Lock-Properties](06-lock-properties/00-overview.md)
7. [sync-collection-REPORT](07-sync-collection-report/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→7). Aufgabe 5
ändert die Middleware-Kette in `packages/server/src/app.ts` (fügt sich
zwischen die ACL-Autorisierung aus M3 und die eigentlichen Route-Handler
ein) — **keine** Änderung an den einzelnen M2/M3-Routen-Dateien selbst
nötig, da Lock-Prüfung rein Header-/DB-basiert ist und als
Cross-Cutting-Middleware funktioniert.

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M4-Definition
- [planning/05-data-model.md](../../planning/05-data-model.md) — `collection_locks`/`file_locks`, `sync_seq`/`collection_changes`
- [planning/06-standards-compliance.md](../../planning/06-standards-compliance.md) — RFC 4918 (Class 2), RFC 6578

## Abgrenzung (nicht Teil von M4)
- **Locked-Null-Resources** (LOCK auf einen noch nicht existierenden
  Pfad, um den Namen zu reservieren) — RFC4918 erlaubt das, aber es ist
  ein selten genutztes Feature mit eigener Fehlerbehandlungs-Komplexität
  (Cleanup, falls nie ein PUT folgt); bewusst zurückgestellt, siehe
  [planning/03-open-questions.md](../../planning/03-open-questions.md)
- **Volle Multistatus-Fehlerberichte bei teilweise gesperrten
  Teilbäumen** (RFC4918 §9.10.9): DavNode lehnt eine rekursive
  Operation (DELETE/MOVE/LOCK mit `Depth: infinity`) bei **jedem**
  Konflikt im Teilbaum vollständig mit `423` ab, statt pro Ressource
  einzeln aufzuschlüsseln, welche gesperrt ist — bewusste Vereinfachung
- **Retention/Pruning des `collection_changes`-Logs** — wächst aktuell
  unbegrenzt; Aufräum-Strategie ist zurückgestellt, siehe
  [planning/03-open-questions.md](../../planning/03-open-questions.md)
- Kein CalDAV/CardDAV-spezifisches Sync-Verhalten (M5/M6 nutzen dieselbe
  Infrastruktur, aber das ist dort zu bauen)
