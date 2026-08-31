# Datenmodell — Kern-Entwurf (M1)

Konkretisierung der Entscheidungen aus [01-decisions.md](01-decisions.md)
(Runden 10–12): dediziertes `principals`-Table, Domänentrennung mit echten
FKs (auch für ACE/Lock/Change-Log), ACEs auf Collection- **und**
Objekt-Ebene, Content-Split (Metadaten vs. Blob), Hybrid-Quota-Tracking.

Feldlisten sind bewusst auf das Wesentliche reduziert (keine vollständige
DDL) — Detailtypen (z.B. Blob-Spaltentyp je DB-Engine) sind noch offen,
siehe [03-open-questions.md](03-open-questions.md).

## Wiederkehrendes Muster pro Ressourcen-Domäne

Jede der drei Domänen (WebDAV, Calendar, Addressbook) folgt derselben
Struktur — hier einmal generisch beschrieben, unten nur die
domänenspezifischen Abweichungen:

- **Collection-Tabelle** (Wurzel der Domänen-Hierarchie je Nutzer/Tenant,
  z.B. ein Ordner, ein Kalender, ein Adressbuch)
- **Objekt-Tabelle** (Kinder der Collection: Datei, Kalenderereignis,
  Kontakt), referenziert die Collection per FK
- **`*_aces`** auf **beiden** Ebenen (Collection und Objekt) —
  Zugriffsregeln, ACL-Auswertung in `core` merged geerbte (von der
  Collection) und direkte (auf dem Objekt selbst gesetzte) ACEs
- **`*_locks`** auf **beiden** Ebenen — WebDAV LOCK kann jede beliebige
  Ressourcen-URI adressieren, nicht nur Collections
- **`*_changes`** nur auf **Collection-Ebene** — ein Eintrag pro Änderung
  eines direkten Kindes (hinzugefügt/geändert/gelöscht), mit monoton
  steigender `seq` je Collection. Trägt Name/Href des Kindes **denormalisiert**
  mit, damit eine Löschung weiterhin über `sync-collection` gemeldet werden
  kann, nachdem die eigentliche Objekt-Zeile bereits gelöscht wurde
- Die Collection-Zeile selbst trägt einen **`sync_seq`-Zähler** (wird bei
  jeder Kind-Änderung erhöht); der aktuelle Wert ist das an Clients
  ausgegebene Sync-Token

## Core / Tenancy

- **Tenant** — `id`, `slug` (für Pfad-Präfix `/dav/{slug}/...`), `name`,
  `quota_limit_bytes`, `quota_used_bytes` (laufender Zähler,
  Tenant-weiter Gesamt-Deckel zusätzlich zur User-Quota), `created_at`
- **Principal** — `id`, `tenant_id`, `kind` (`user` | `group` | `special`),
  `special_kind` (nullable: `authenticated` | `unauthenticated` | `all` |
  `owner` | `self`)
- **User** — `id`, `principal_id` (FK, unique), `tenant_id`, `username`,
  `email`, `quota_limit_bytes`, `quota_used_bytes` (laufender Zähler),
  `default_calendar_id` (nullable FK → CalendarCollection, ergänzt
  Runde 22 — Ziel für automatisch eingetragene Scheduling-Einladungen,
  gesetzt bei Anlage des ersten Kalenders eines Nutzers), `role` (Enum
  `'member' | 'tenant_admin' | 'server_admin'`, Default `'member'` —
  ersetzt das in Runde 23 eingeführte `is_admin`-Platzhalter-Flag durch
  ein echtes Rollenmodell, Runde 24; der M1-Bootstrap-Nutzer wird
  `server_admin`), `created_at`
- **Group** — `id`, `principal_id` (FK, unique), `tenant_id`, `name`,
  `description`
- **GroupMembership** — `id`, `group_id` (FK → Group), `member_principal_id`
  (FK → Principal) — Mitglied kann Nutzer oder wieder eine Gruppe sein
  (verschachtelte Gruppen möglich, da über Principal referenziert)
- **Credential** — `id`, `user_id` (FK), `type` (`basic` | `digest` |
  `oauth2`), sowie je nach `type`: `password_hash` (bcrypt/argon2, für
  `basic`), `digest_ha1` + `digest_realm` (für `digest`, siehe
  Sicherheitshinweis in Entscheidungsprotokoll Runde 12; SHA-256 in v1,
  kein MD5 — Runde 25), `oauth2_issuer` + `oauth2_subject` (für
  `oauth2` — Issuer-URL + `sub`-Claim eines extern konfigurierten
  OIDC-Providers, unique zusammen; **kein** JIT-Provisioning, die
  Verknüpfung muss vorab per Admin-API bestehen — Runde 25)

## WebDAV-Domäne (generische Dateiablage)

- **Collection** — `id`, `tenant_id`, `parent_collection_id` (nullable,
  self-FK), `owner_principal_id` (FK → Principal), `display_name`,
  `sync_seq`, `created_at`, `updated_at`
- **FileResource** — `id`, `tenant_id`, `collection_id` (FK → Collection),
  `name`, `content_type`, `etag`, `size_bytes`, `owner_principal_id`,
  `created_at`, `updated_at`
- **FileContent** — `id`, `file_resource_id` (FK, unique), `data` (Blob)
- `collection_aces`, `file_aces`
- `collection_locks`, `file_locks`
- `collection_changes` (Kinder: Sub-Collections und FileResources)
- `collection_properties`, `file_properties` — **Dead Properties** (RFC
  4918): beliebige, vom Client per PROPPATCH gesetzte Properties, die
  der Server nicht selbst interpretiert, aber persistent zurückgeben
  muss. Je Zeile: `resource_id` (FK), `namespace` (XML-Namespace-URI),
  `name` (lokaler Property-Name), `value` (Text/XML-Fragment als
  String). Unique auf `(resource_id, namespace, name)`. **Live
  Properties** (`displayname`, `getcontentlength`, `getcontenttype`,
  `getetag`, `getlastmodified`, `creationdate`, `resourcetype`) werden
  dagegen direkt aus den festen Spalten von `Collection`/`FileResource`
  abgeleitet, nicht aus dieser Tabelle. *Ergänzt bei der M2-Detailplanung
  (Runde 18) — war in der ursprünglichen Domänen-Übersicht nicht
  enthalten.* Das gleiche Muster (separate `*_properties`-Tabelle pro
  Domäne) gilt später auch für Calendar/Addressbook (M5/M6).

## Calendar-Domäne (CalDAV)

- **CalendarCollection** — `id`, `tenant_id`, `owner_principal_id` (FK →
  Principal), `display_name`, `description` (nullable,
  `CALDAV:calendar-description`), `supported_component_set` (v1: nur
  `VEVENT`, als erweiterbares Set angelegt), `timezone` (nullable,
  `CALDAV:calendar-timezone`), `ics_feed_token` (nullable, siehe
  URL-Schema unten), `sync_seq`, `created_at`, `updated_at`. **Kein**
  `parent_collection_id` — Kalender verschachteln sich nicht, liegen
  flach unter einer virtuellen Home-Collection
  `/dav/{tenant}/calendars/{userId}/` (Runde 21, gleiches Muster wie
  `AddressbookCollection`, Runde 20)
- **CalendarObject** — `id`, `tenant_id`, `calendar_id` (FK →
  CalendarCollection), `uid` (iCal UID, unique innerhalb des Kalenders —
  alle Recurrence-Instanzen/Overrides mit derselben UID gehören zu
  **einem** CalendarObject, siehe M6-Detailplanung), `etag`,
  `component_type` (v1: `VEVENT`), `owner_principal_id`,
  **Time-Range-Index-Spalten** (Runde 21 — direkt auf der Zeile, nicht
  als separate Tabelle, da einwertig anders als bei
  `AddressObjectIndex`): `dtstart`, `dtend` (nullable), `is_all_day`
  (Boolean), `recurrence_span_end` (nullable = unbegrenzt
  wiederkehrend, sonst aus `UNTIL`/`COUNT` berechnet),
  `transparency` (`opaque` | `transparent`, Default `opaque`),
  `status` (`tentative` | `confirmed` | `cancelled`, nullable = wie
  `confirmed`), `created_at`, `updated_at`
- **CalendarObjectContent** — `id`, `calendar_object_id` (FK, unique),
  `ics_data` (Blob/Text, **vollständiger** VCALENDAR-Wrapper inkl.
  Master-Event **und** aller `RECURRENCE-ID`-Overrides derselben UID)
- `calendar_aces`, `calendar_object_aces`
- `calendar_locks`, `calendar_object_locks`
- `calendar_changes`
- `calendar_properties`, `calendar_object_properties` — Dead
  Properties, gleiches Muster wie WebDAV/Addressbook (Runde 18)
- *Bewusst nicht in v1*: `VTODO`/`VJOURNAL` (nur `VEVENT`), da DUE- statt
  DTSTART/DTEND-Semantik eigene Time-Range-Logik bräuchte — siehe
  [planning/03-open-questions.md](03-open-questions.md)

## Scheduling-Domäne (RFC 6638, M7)

- **SchedulingInboxItem** — `id`, `tenant_id`, `owner_principal_id` (FK
  → Principal, dessen Inbox), `ics_data` (rohe iTIP-Nachricht:
  `METHOD:REQUEST`/`REPLY`/`CANCEL` + `VEVENT`), `method` (Enum
  `'REQUEST' | 'REPLY' | 'CANCEL'`), `uid` (zugehörige Event-UID, für
  Korrelation), `etag`, `created_at`. Die Scheduling-**Outbox** ist rein
  ein POST-Ziel (`freebusy-request`, RFC 6638 §3.4.3) und bekommt in v1
  **keine** eigene persistente Tabelle — kein Bedarf, da Outbox-POSTs
  sofort verarbeitet werden
- Kein separates ACE/Lock/Change-Tabellen-Set für die Scheduling-Domäne
  — Inbox-Items nutzen die WebDAV-ACL-Engine nicht (Zugriff ist implizit
  auf den `owner_principal_id` beschränkt, siehe M7-Detailplanung)

## Addressbook-Domäne (CardDAV)

- **AddressbookCollection** — `id`, `tenant_id`, `owner_principal_id`
  (FK → Principal), `display_name`, `description` (nullable,
  `CARD:addressbook-description`), `sync_seq`, `created_at`,
  `updated_at`. **Kein** `parent_collection_id` — Adressbücher
  verschachteln sich nicht; alle Adressbücher eines Nutzers liegen flach
  unter einer virtuellen (nicht in der DB abgebildeten) Home-Collection
  `/dav/{tenant}/addressbooks/{userId}/` (Runde 20 — Klarstellung der
  bisherigen "wie Collection"-Formulierung; gleiches Muster gilt später
  für `CalendarCollection`, M6)
- **AddressObject** — `id`, `tenant_id`, `addressbook_id` (FK →
  AddressbookCollection), `uid` (vCard UID), `etag`, `owner_principal_id`,
  `created_at`, `updated_at`
- **AddressObjectContent** — `id`, `address_object_id` (FK, unique),
  `vcard_data` (Blob/Text, rohe vCard)
- `addressbook_aces`, `address_object_aces`
- `addressbook_locks`, `address_object_locks`
- `addressbook_changes`
- `addressbook_properties`, `address_object_properties` — Dead
  Properties, gleiches Muster wie die WebDAV-Domäne (Runde 18)
- **AddressObjectIndex** — `id`, `address_object_id` (FK),
  `property_name` (z.B. `FN`, `N`, `EMAIL`, `TEL`, `ORG`, `NICKNAME`),
  `property_value` (Text, für Vergleich normalisiert/lowercased), beim
  Schreiben aus dem vCard-Inhalt geparst. Löst die bisher als
  "zurückgestellt auf M5" markierten geparsten/indexierten Felder für
  `addressbook-query`-Filter auf (Runde 20) — vermeidet, dass jede
  Filter-Anfrage alle vCard-Blobs laden/parsen muss

## Quota

Umsetzung des Hybrid-Ansatzes aus Runde 12, auf zwei Ebenen (Runde 15):
- `quota_limit_bytes` / `quota_used_bytes` auf **User** UND auf **Tenant**
  (Gesamt-Deckel über alle Nutzer eines Mandanten)
- Beim Schreiben wird gegen **beide** Limits geprüft; Zähler werden bei
  jedem Schreiben/Löschen in `FileContent`/`CalendarObjectContent`/
  `AddressObjectContent` transaktional auf beiden Ebenen mitgeführt
- Periodischer Recompute-Job (Cron) und manueller Recompute (Admin-API)
  berechnen `quota_used_bytes` unabhängig aus den tatsächlichen
  Content-Größen neu und korrigieren Drift (auf beiden Ebenen)

## URL-Schema (Pfad-Präfix-Tenancy, Runde 15)

Alle DAV- und Principal-URLs sind unter `/dav/{tenantSlug}/...` verortet
(`Tenant.slug`). Beispiele:
- `/dav/{tenant}/principals/users/{userId}` — Nutzer-Principal
- `/dav/{tenant}/principals/groups/{groupId}` — Gruppen-Principal
- `/dav/{tenant}/files/...` — WebDAV-Dateibaum (Collection/FileResource)
- `/dav/{tenant}/calendars/{userId}/` — **virtuelle** Calendar-Home-
  Collection eines Nutzers (RFC 4791 §5.2.1, nicht in der DB abgebildet,
  gleiches Muster wie die Addressbook-Home-Collection, Runde 21)
- `/dav/{tenant}/calendars/{userId}/{calendarId}/` — konkreter Kalender
  (Collection)
- `/dav/{tenant}/calendars/{userId}/{calendarId}/{objectId}.ics` —
  einzelnes CalendarObject
- `/dav/{tenant}/calendars/{userId}/{calendarId}/feed/{token}.ics` —
  aggregierter, read-only ICS-Feed (M6, Runde 14/21) — Token als
  Pfadsegment statt Query-Parameter (vermeidet Referer-Header-Leakage)
- `/dav/{tenant}/calendars/{userId}/inbox/` — Scheduling-Inbox (M7,
  RFC 6638 §2.2), enthält `SchedulingInboxItem`-Ressourcen
- `/dav/{tenant}/calendars/{userId}/outbox/` — Scheduling-Outbox (M7,
  RFC 6638 §2.2), reines POST-Ziel, keine persistenten Ressourcen
- `/dav/{tenant}/addressbooks/{userId}/` — **virtuelle** Addressbook-
  Home-Collection eines Nutzers (RFC 6352 §7.1.1, nicht in der DB
  abgebildet, siehe Addressbook-Domäne oben)
- `/dav/{tenant}/addressbooks/{userId}/{addressbookId}/` — konkretes
  CardDAV-Adressbuch (Collection)
- `/dav/{tenant}/addressbooks/{userId}/{addressbookId}/{objectId}.vcf` —
  einzelnes AddressObject

- `/.well-known/caldav`, `/.well-known/carddav` — RFC-6764-Discovery
  (M11, Runde 26), **außerhalb** des `/dav/{tenant}/...`-Präfixes;
  Tenant-Auflösung über `DAVNODE_DEFAULT_TENANT` oder
  `username@tenantSlug`-Format beim Basic-Auth-Prompt

Sonder-Principals (`DAV:authenticated`, `DAV:all`, `DAV:unauthenticated`,
`DAV:owner`, `DAV:self`) haben **keine** eigene URL — sie werden gemäß
RFC 3744 als spezielle XML-Elemente innerhalb von `<D:principal>`
dargestellt (z.B. `<D:all/>`), nicht als `<D:href>`. In der DB sind sie
trotzdem `Principal`-Zeilen (für ACE-Referenzen), aber ohne zugehörige
`User`/`Group`-Zeile.

## ACL-Privilege-Katalog (RFC 3744 §5.3, Basis für M3)

Der `privilege`-Wert in den `*_aces`-Tabellen nutzt ein gemeinsames
Enum, das über alle sechs ACE-Tabellen hinweg identisch ist (reines
Vokabular, keine Fremdschlüssel-Beziehung — daher kein Konflikt mit dem
Domänentrennungs-Prinzip). Aggregierte Privileges (z.B. `DAV:all`,
`DAV:write`) werden **nicht** expandiert in der DB gespeichert, sondern
zur Auswertungszeit in der `core`-ACL-Engine aufgelöst:

- `DAV:read`
- `DAV:write` (aggregiert `write-properties` + `write-content`)
- `DAV:write-properties`
- `DAV:write-content`
- `DAV:bind` (Kind zu Collection hinzufügen)
- `DAV:unbind` (Kind aus Collection entfernen)
- `DAV:unlock`
- `DAV:read-acl`
- `DAV:write-acl`
- `DAV:read-current-user-privilege-set`
- `DAV:all` (aggregiert alle oben genannten)

**`CALDAV:read-free-busy`** (RFC 4791 §6.1.1, ergänzt in M6/Runde 21) —
eigenständiges, **nicht** unter `DAV:all` aggregiertes Privilege; deckt
ausschließlich den Zugriff auf `free-busy-query` ab, nicht das Lesen der
vollständigen Termin-Details.

**Scheduling-Privileges** (RFC 6638 §6.2, ergänzt in M7):
- `CALDAV:schedule-deliver` (aggregiert `schedule-deliver-invite` +
  `schedule-deliver-reply`) — auf der Inbox, kontrolliert ob der Server
  iTIP-Nachrichten zustellen darf
- `CALDAV:schedule-send` (aggregiert `schedule-send-invite` +
  `schedule-send-reply` + `schedule-send-freebusy`) — auf der Outbox,
  kontrolliert ob ein Principal Scheduling-Nachrichten senden darf
  (in v1 nur für `freebusy-request`-POSTs relevant, siehe Abgrenzung
  in [milestones/M7-caldav-scheduling](../milestones/M7-caldav-scheduling/00-setting-goal.md))
*Hinweis*: die genaue Aggregationshierarchie wird bei der Implementierung
anhand RFC 3744 §5.3 verifiziert — die Liste oben ist der Planungsstand,
keine zitierfähige Normkopie.

## Offene Detailpunkte (→ [03-open-questions.md](03-open-questions.md))
- Blob-Spaltentyp je DB-Engine (Postgres bytea/MySQL LONGBLOB/SQLite BLOB)
  — TypeORM-Spaltendefinition je Driver
- Token-Authentifizierung für den ICS-Feed (siehe Runde 14)
