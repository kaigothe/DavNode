# Standards-Compliance-Matrix

Referenzdokument: welche RFCs in welchem Meilenstein ([02-roadmap.md](02-roadmap.md))
in welcher Tiefe umgesetzt werden. Wird aktualisiert, sobald während der
Umsetzung neue Standards-Details relevant werden.

## Kern-Standards

| RFC | Titel | Kernfunktionen (Auszug) | Meilenstein | Tiefe/Hinweis |
|---|---|---|---|---|
| RFC 4918 | WebDAV (HTTP Extensions) | PROPFIND/PROPPATCH, MKCOL, COPY/MOVE, GET/PUT/DELETE, LOCK/UNLOCK, ETag, Depth-Header | M2 (Class 1), M4 (Class 2 Locking) | Class 1 + 2 vollständig. Class 3 (Ordered Collections, RFC 3648) nicht geplant |
| RFC 3253 (Teilmenge) | WebDAV Versioning (DeltaV) | REPORT-Methode als Infrastruktur für ACL-/Sync-/CalDAV-/CardDAV-REPORTs | M3 | Nur REPORT-Method-Grundmechanik, keine volle DeltaV-Versionierung |
| RFC 3744 | WebDAV ACL | Principals, Privileges, ACEs (grant/deny), `acl`-Property, `principal-property-search` REPORT | M3 | Volle Umsetzung, inkl. ACEs auf Objekt-Ebene (Entscheidung Runde 12) |
| RFC 5397 | WebDAV Current Principal Extension | `current-user-principal`-Property | M3 | Kleine Ergänzung zu ACL |
| RFC 4331 | WebDAV Quota and Size Properties | `quota-available-bytes` / `quota-used-bytes`-Properties | M8 | Nutzt Quota-Datenmodell aus Runde 12 |
| RFC 6578 | Collection Synchronization for WebDAV | `sync-collection` REPORT, Sync-Token | M4 | Nutzt Change-Log-Datenmodell (Runde 10/11) |
| RFC 6352 | CardDAV | Addressbook-Collections, `addressbook-query`/`-multiget` REPORT | M5 | — |
| RFC 6350 | vCard 4.0 | Datenformat für AddressObject-Inhalte | M5 | vCard 3.0 (RFC 2426) evtl. zusätzlich für Client-Kompatibilität → M11 |
| RFC 4791 | CalDAV | Calendar-Collections, `calendar-query`/`-multiget` REPORT, `free-busy-query` | M6 | — |
| RFC 5545 | iCalendar | Datenformat für CalendarObject-Inhalte | M6 | Etablierte iCal-Library nutzen statt Eigenbau (offene Frage) |
| RFC 6638 | Scheduling Extensions to CalDAV | Scheduling-Inbox/-Outbox, iTIP über CalDAV, POST-basierte Einladungen | M7 | — |
| RFC 5546 | iTIP | Semantik der Scheduling-Nachrichten (REQUEST/REPLY/CANCEL/...) | M7 | Von RFC 6638 referenziert |
| — (De-facto-Konvention) | ICS-Feed / Internet Calendar Subscription | Aggregierte, read-only `.ics`-URL pro Kalender (nutzt RFC 5545-Format, kein eigenes REPORT/DAV) | M6 | Für Outlook-Einbindung (Entscheidung Runde 14), kein CalDAV im engeren Sinn |

## Bewusst nicht geplant
- **RFC 3648** (WebDAV Ordered Collections, Class 3) — in der Praxis kaum
  von Clients genutzt
- **Volle DeltaV-Versionierung** (RFC 3253 vollständig) — nur die
  REPORT-Methode wird als Infrastruktur übernommen, kein Versionsverlauf
  von Ressourcen
- **RFC 5842** (WebDAV BIND, mehrere Bindungen/Hardlinks für eine
  Ressource) — nicht vorgesehen

## Client-Kompatibilität (M11)

Die drei in der ursprünglichen Zielsetzung genannten Anbieter sind
technisch sehr unterschiedlich relevant und werden in M11 differenziert
angegangen, nicht als ein Block:

- **Apple** (Calendar.app/Contacts.app auf macOS/iOS): sprechen natives
  CalDAV/CardDAV, nutzen aber proprietäre Erweiterungen (z.B.
  `getctag`-Property als de-facto-Standard, Apples Calendar-Sharing-
  Extension jenseits RFC 3744). Hohe Priorität, da Kernzielgruppe für
  DAV-Clients.
- **Google** (Google Calendar/Contacts): unterstützt CalDAV/CardDAV, aber
  mit Einschränkungen/Abweichungen (z.B. CardDAV historisch nur
  eingeschränkt, OAuth2 praktisch zwingend, Scheduling-Verhalten weicht
  teils von RFC 6638 ab). Erfordert eigene Recherche zur aktuellen API-
  Lage bei Umsetzung von M11.
- **Microsoft**: geklärt (Entscheidungsprotokoll Runde 13) — gemeint ist
  der **Windows-WebDAV-Mini-Redirector** (Windows-Explorer-Netzlaufwerk-
  Client), reiner Datei-WebDAV-Zugriff, bekannt eigenwillig bei z.B.
  Locking-Verhalten und Headern. **Nicht** Outlook/Exchange-Kalender-/
  Kontakte-Sync (die nutzen ohnehin MAPI/EWS/ActiveSync statt CalDAV/
  CardDAV und sind kein Teil dieses Projekts).
