# M2 — WebDAV Core (Class 1)

## Setting (Kontext)
M0 hat das technische Fundament gelegt, M1 die Tenancy-/Principal-/Auth-
Grundlage (siehe [milestones/M1-kern-datenmodell-tenancy](../M1-kern-datenmodell-tenancy/00-setting-goal.md)).
M2 ist der erste Meilenstein, der tatsächlich einen laufenden,
HTTP-erreichbaren Server produziert: die WebDAV-Domänen-Entities
(Collection/FileResource/FileContent), einen echten Express-Server in
`@davnode/server`, und die WebDAV-Class-1-Methoden (RFC 4918, ohne
Locking — das ist Class 2, M4).

**Wichtig**: In M2 gibt es noch **keine** ACL-Engine (RFC 3744, erst M3).
Zugriffskontrolle läuft in M2 über eine bewusst einfache
Platzhalter-Regel ("nur der Eigentümer einer Ressource darf darauf
zugreifen/schreiben"), die in M3 durch die vollständige ACL-Auswertung
ersetzt wird. Diese Regel ist damit **keine Sicherheitslücke** in M2
(es gibt keinen ungeprüften Zugriff), aber auch **keine** vollständige
RFC3744-Umsetzung — nur eine sichere Zwischenstufe.

## Ziel
Am Ende von M2 kann ein Basic-Auth-authentifizierter Client (z.B. per
`curl` oder einem echten WebDAV-Client) gegen
`/dav/{tenant}/files/...` PROPFIND, PROPPATCH, GET, PUT, DELETE, MKCOL,
COPY und MOVE ausführen und erhält spezifikationskonforme Antworten
(Multistatus-XML, ETags, korrekte Statuscodes, korrekte Fehlerfälle wie
409 Conflict bei fehlender Elternressource). Referenz-Validierung: die
litmus-Basistests (Class-1-Teil,
[planning/06-standards-compliance.md](../../planning/06-standards-compliance.md))
laufen erfolgreich gegen den lokal gestarteten Server.

## Große Aufgaben (Übersicht)
1. [WebDAV-Domänen-Entities](01-webdav-domain-entities/00-overview.md)
2. [Express-Server-Bootstrap](02-express-server-bootstrap/00-overview.md)
3. [WebDAV-XML- & Property-Infrastruktur](03-webdav-xml-property-infrastructure/00-overview.md)
4. [PROPFIND](04-propfind/00-overview.md)
5. [PROPPATCH](05-proppatch/00-overview.md)
6. [Resource-CRUD (MKCOL/GET/PUT/DELETE)](06-resource-crud/00-overview.md)
7. [COPY/MOVE](07-copy-move/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→7). Aufgaben 4–7
setzen alle auf 1–3 auf.

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M2-Definition
- [planning/05-data-model.md](../../planning/05-data-model.md) — WebDAV-Domäne (inkl. Dead-Properties-Ergänzung, Runde 18)
- [planning/04-architecture.md](../../planning/04-architecture.md) — Schichtung core/server, Auth-Split
- [planning/06-standards-compliance.md](../../planning/06-standards-compliance.md) — RFC 4918, litmus
- [planning/07-coding-conventions.md](../../planning/07-coding-conventions.md) — TSDoc-Pflicht gilt ab jetzt für allen neuen Code
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 18

## Abgrenzung (nicht Teil von M2)
- Keine ACL-Engine/keine ACE-Auswertung (M3) — nur die Owner-Platzhalter-
  Regel, siehe oben
- Kein Locking (Class 2, M4) — `supportedlock`/`lockdiscovery`-
  Properties werden zwar bereits ausgeliefert (Spec-Konformität), melden
  aber "keine Sperren unterstützt"
- Kein Sync-Token/`sync-collection` REPORT (M4) — `collection_changes`
  wird zwar bereits bei jeder Änderung mitgeschrieben (Vorbereitung),
  aber der REPORT-Endpunkt selbst kommt erst M4
- Keine Quota-Durchsetzung (M8) — `quota_used_bytes` wird in M2 **nicht**
  aktualisiert, das folgt mit dem Hybrid-Quota-Tracking in M8
- Kein CalDAV/CardDAV (M5/M6)
