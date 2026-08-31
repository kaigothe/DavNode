# M3 — WebDAV ACL (RFC 3744)

## Setting (Kontext)
M2 hat einen funktionierenden WebDAV-Class-1-Server gebaut, aber mit
einer bewusst einfachen Platzhalter-Autorisierung ("nur der Eigentümer
darf zugreifen") — siehe
[milestones/M2-webdav-core/00-setting-goal.md](../M2-webdav-core/00-setting-goal.md).
M3 ersetzt das durch die vollständige RFC-3744-ACL-Engine: Principals
(bereits in M1 als dediziertes Table angelegt), Gruppen (M1), granulare
Privileges und ACEs auf Collection- **und** Objekt-Ebene (Entscheidung
Runde 12).

**Wichtige Konsequenz, die beim Übergang von M2 zu M3 zu beachten ist**:
RFC 3744 ist **default-deny** — existiert für eine Ressource keine
passende ACE, ist der Zugriff verboten, **auch für den Eigentümer**.
Damit ein frisch angelegtes Collection/FileResource nach der Umstellung
auf M3 nicht sofort für den eigenen Eigentümer unzugänglich wird, muss
bei jeder Ressourcen-Erzeugung automatisch eine Default-ACE
("Eigentümer darf alles") angelegt werden. Diese Aufgabe (Große Aufgabe
1, Sub-Task 3) baut die dafür nötige Utility-Funktion — die
Aufrufstellen aus M2 (MKCOL, PUT-Neuanlage, COPY, Root-Collection-
Bootstrap) wurden nachträglich um einen Verweis darauf ergänzt.

## Ziel
Am Ende von M3 werden alle WebDAV-Zugriffe (inkl. der in M2 gebauten
Methoden) über die vollständige ACL-Engine geprüft statt über die
Owner-Platzhalter-Regel. Clients können per `ACL`-HTTP-Methode Rechte
vergeben, per PROPFIND ACL-Properties (`owner`, `acl`,
`current-user-privilege-set`, `current-user-principal`, ...) abfragen,
und per `principal-property-search`-REPORT Principals (Nutzer/Gruppen)
finden, um ihnen Rechte zu geben.

## Große Aufgaben (Übersicht)
1. [ACE-Entities & Privilege-Katalog](01-ace-entities-and-privileges/00-overview.md)
2. [Group-Membership-Reverse-Lookup](02-group-membership-reverse-lookup/00-overview.md)
3. [ACL-Evaluation-Engine](03-acl-evaluation-engine/00-overview.md)
4. [ACL-HTTP-Methode](04-acl-http-method/00-overview.md)
5. [ACL-Properties](05-acl-properties/00-overview.md)
6. [Principals & REPORT-Infrastruktur](06-principals-and-report-infrastructure/00-overview.md)
7. [Platzhalter-Autorisierung ersetzen](07-replace-placeholder-authorization/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→7) — Aufgabe 7
(Umstellung der bestehenden M2-Routen) muss zuletzt kommen, da sie alle
vorherigen Bausteine (Evaluation-Engine, Default-ACE) voraussetzt.

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M3-Definition
- [planning/05-data-model.md](../../planning/05-data-model.md) — ACL-Privilege-Katalog, ACE-Ebene (Runde 12)
- [planning/06-standards-compliance.md](../../planning/06-standards-compliance.md) — RFC 3744, RFC 5397
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 10–12 (Principals/Domänentrennung/ACE-Ebene)

## Abgrenzung (nicht Teil von M3)
- Kein Locking (Class 2, M4)
- Kein Sync-Token/`sync-collection` REPORT (M4)
- Keine CalDAV-/CardDAV-spezifischen Privileges (`CALDAV:read-free-busy`,
  `CALDAV:schedule-*`) — kommen erst mit M6/M7, wenn die
  Scheduling-Inbox/-Outbox entworfen werden (siehe
  [planning/05-data-model.md](../../planning/05-data-model.md))
- Keine Apple-artige Sharing-Erweiterung jenseits RFC 3744 (bewusst
  zurückgestellt, siehe [planning/03-open-questions.md](../../planning/03-open-questions.md))
- Kein `expand-property`-REPORT (RFC 3253) — nützlich für Client-
  Komfort, aber keine Voraussetzung für eine funktionierende ACL-
  Engine; bewusst zurückgestellt, siehe
  [planning/03-open-questions.md](../../planning/03-open-questions.md)
