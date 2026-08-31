# Entscheidungsprotokoll

Kurzes ADR-artiges Log. Jede Entscheidung mit Datum, Kontext/Begründung und
Status. Spätere Änderungen werden als neuer Eintrag ergänzt statt alte
Einträge zu überschreiben (Historie bleibt nachvollziehbar).

---

## 2026-08-30 — Grundsatzentscheidungen (Runde 1)

**Techstack**: Node.js + Express.js + TypeORM.
*Begründung*: TypeORM explizit wegen Datenbank-Unabhängigkeit gewählt — das
DB-System soll austauschbar sein (z.B. Postgres/SQLite/MySQL, genaue Auswahl
folgt).

**Funktionsumfang**: Vollpaket WebDAV + CalDAV + CardDAV (nicht nur eine
Teilmenge).

**Zielgruppe/Kontext**: Open-Source-Projekt, das von privatem Einsatz bis zur
Grundlage für andere Open-Source-Software bzw. mittelständische Unternehmen
skalieren soll.

**Standards-Strategie**: Erst korrekte RFC-Umsetzung (WebDAV/ACL/CalDAV/
CardDAV), dann client-spezifische Kompatibilität (Apple, Google, Microsoft)
als spätere Phase.

**Deployment**: Docker-Container als primäre Zielumgebung.

**Vorbilder**: Kein festes Referenzprojekt — eigenständiges Konzept.

*Status: entschieden*

---

## 2026-08-30 — Architektur-Grundsatzentscheidungen (Runde 2)

**Architektur**: Library + Server-Wrapper. Die Kernlogik (DAV-Protokoll,
ACL-Engine, Datenmodell/Repositories) wird als eigenständiges, von Express
entkoppeltes Package gebaut. Der Express-Server ist eine dünne Hülle
darüber (HTTP-Routing, Middleware-Integration).
*Begründung*: Konsistent mit dem Ziel, als Grundlage für andere Open-Source-
Software dienen zu können — die Core-Engine muss auch ohne Express nutzbar
sein (z.B. Einbindung in andere Frameworks).

**Multi-Tenancy**: wird von Anfang an im Datenmodell/ACL-Konzept mitgedacht,
auch wenn v1 ggf. nur einen Mandanten nutzt. Konkrete Umsetzungsstrategie
(shared schema mit tenant_id vs. schema-per-tenant) ist noch offen (→ siehe
offene Fragen).

**Authentifizierung**: pluggable Auth-Architektur. Für v1 werden als
konkrete Provider eingeplant: Basic Auth (HTTPS), Digest Auth und
OAuth2/Bearer-Token. Weitere Mechanismen sollen sich als zusätzliche
Provider ergänzen lassen, ohne den Core anzufassen.

**Storage der Ressourceninhalte**: alles in der Datenbank (auch
Dateiinhalte/iCal/vCard-Objekte als Blob), kein separates Dateisystem-
Backend für v1.
*Begründung*: passt zur DB-Unabhängigkeits-Philosophie (TypeORM) — die
gesamte Persistenz läuft über eine Abstraktion, kein Sonderfall
"Filesystem" nötig. Vereinfacht Deployment/Backup (ein Datenspeicher statt
zwei). Konsequenz für später: Streaming/Chunking großer Dateien über die DB
muss im Datenmodell/Storage-Layer bedacht werden.

*Status: entschieden*

---

## 2026-08-30 — Datenmodell- & ACL-Grundsatzentscheidungen (Runde 3)

**Multi-Tenancy-Umsetzung**: Shared Schema mit `tenant_id`-Spalte in den
relevanten Tabellen (kein Schema-per-Tenant, kein DB-per-Tenant).
*Begründung*: funktioniert einheitlich über alle geplanten DB-Engines
(insb. SQLite kennt kein Schema-Konzept), einfachste Migrationsstrategie.

**ACL-Modell**: volle RFC 3744-Umsetzung (Principals, granulare Privileges,
ACEs mit grant/deny, Property-basierte ACL-Abfragen). Kein vereinfachtes
Rollenmodell als Fassade.
*Begründung*: maximale Standardkonformität und Kompatibilität mit DAV-
Clients, die native ACL-Requests stellen.

**Datenbank-Engines**: PostgreSQL, SQLite und MySQL/MariaDB werden explizit
unterstützt und getestet (via TypeORM-Abstraktion). Besonders relevant, da
Ressourceninhalte als Blobs in der DB liegen (Entscheidung Runde 2) — die
Blob-Handhabung unterscheidet sich je Engine und muss in allen dreien
funktionieren.

**Erweiterbarkeit**: Von Anfang an definierte Hook-/Extension-Points in der
Core-Engine (z.B. für externe Auth-Provider wie LDAP/OIDC, Storage-Quotas,
Virus-Scan, Custom Properties), auch wenn v1 nur Standardverhalten nutzt.

*Status: entschieden*

---

## 2026-08-30 — Standard-Umfang v1 (Runde 4)

**WebDAV Locking (Class 2)**: ja, in v1 (LOCK/UNLOCK, exclusive/shared
Locks, Lock-Tokens, Timeout-Handling).

**WebDAV Sync (RFC 6578, sync-collection REPORT)**: ja, in v1. Sync-Token-
Konzept muss im Datenmodell abgebildet werden (Change-Tracking pro
Collection).

**CalDAV Scheduling (RFC 6638, iTIP-Einladungen)**: ja, in v1. Bedingt
Scheduling-Inbox/Outbox pro Kalender-Principal und iTIP-Verarbeitung.

**Quota**: ja, im Datenmodell von Anfang an vorgesehen (pro Nutzer/Mandant),
auch wenn Durchsetzung iterativ kommen kann.

*Anmerkung*: Damit ist der v1-Scope sehr umfangreich (volles RFC3744-ACL +
Locking + Sync-Token + Scheduling + Quota + Multi-Tenancy). Das ist als
Zielbild für die Architektur/das Datenmodell sinnvoll, dürfte aber in der
Umsetzung eine Phasierung in mehrere Meilensteine erfordern (→ wird bei der
Roadmap-Planung konkretisiert, siehe [02-open-questions.md](02-open-questions.md)).

*Status: entschieden (Zielbild), Umsetzungsreihenfolge offen*

---

## 2026-08-30 — Sprache, Gruppen, Admin-API, Konformität (Runde 5)

**Sprache**: TypeScript mit strict-Modus, durchgehend in Core-Library und
Server.

**Gruppen-Principals**: ja, von Anfang an. ACL-Grants können an einzelne
Nutzer-Principals oder an Gruppen-Principals vergeben werden (RFC 3744
Group Principals).

**Admin-/Management-API**: ja, als Teil der Core-Library eingeplant. Nutzt
dieselben Repositories/Services wie die DAV-Schicht (nicht separat/parallel
implementiert). Konkrete Form (REST/RPC) ist Detailfrage.

**Konformitätstests**: litmus (WebDAV), CalDAVtester und CardDAVtester
werden von Anfang an als Teil der Teststrategie eingeplant, ggf. in CI
integriert.

*Status: entschieden*

---

## 2026-08-30 — Roadmap-Bestätigung & Lizenz (Runde 6)

**Roadmap**: die vorgeschlagene Meilenstein-Reihenfolge aus
[02-roadmap.md](02-roadmap.md) (M0 Fundament → M1 Datenmodell/Tenancy →
M2 WebDAV Core → M3 ACL → M4 Locking/Sync → M5 CardDAV → M6 CalDAV →
M7 Scheduling → M8 Quota → M9 Admin-API → M10 weitere Auth-Provider →
M11 Client-Kompatibilität → M12 Hardening) wird bestätigt und übernommen.

**Lizenz**: AGPL-3.0 (Copyleft).
*Begründung*: schützt davor, dass der Server von Dritten kommerziell
verwendet/modifiziert wird, ohne Verbesserungen zurückzugeben — passend
zum Ziel, eine dauerhaft offene Grundlage für andere Open-Source-Software
zu bleiben, auch wenn er in Unternehmen eingesetzt wird. Nutzer, die den
Server als Netzwerkdienst anbieten (auch modifiziert), müssen den
Quellcode offenlegen.

*Status: entschieden*

---

## 2026-08-30 — Tooling M0 (Runde 7)

**Monorepo/Paketmanager**: npm Workspaces (kein Zusatztool wie pnpm/
Turborepo für den Start).

**Test-Framework**: Vitest.

**Node.js-Zielversion**: aktuelle LTS (22.x).

**CI-Plattform**: GitHub Actions (impliziert GitHub als Repo-Hosting).

*Status: entschieden*

---

## 2026-08-30 — Projektname (Runde 8)

**Projektname**: DavNode (löst Arbeitstitel "DavServer" ab). Wird in
package.json, GitHub-Repo-Namen und Doku verwendet.

*Status: entschieden*

---

## 2026-08-30 — Package-Struktur (Runde 9)

**Package-Schnitt**: 3 npm-Workspace-Packages — `core` (DAV-Protokoll,
ACL-Engine, Datenmodell/Repositories, Hook-Points; Express-unabhängig),
`server` (Express-Wrapper), `admin-api` (Verwaltungsschicht, nutzt
`core`-Services). Granularere Aufteilung (separate Packages je Protokoll)
bewusst zurückgestellt — kann bei Bedarf später erfolgen.

**npm-Scope**: `@davnode/*` (z.B. `@davnode/core`, `@davnode/server`,
`@davnode/admin-api`).

*Status: entschieden* — Details zur Ordnerstruktur siehe
[04-architecture.md](04-architecture.md).

---

## 2026-08-30 — Kern-Datenmodell (Runde 10)

**Principals**: dediziertes `principals`-Table. `User` und `Group`
referenzieren jeweils einen Principal-Eintrag; Sonder-Principals
(DAV:authenticated, DAV:all, DAV:owner, ...) sind ebenfalls Einträge
darin. ACEs verweisen einheitlich auf `principal_id`.

**Ressourcen-Baum**: getrennte Tabellen je Domäne (keine generische
`resources`-Tabelle). D.h. eigene Hierarchien für WebDAV-Collections/
-Dateien, Kalender+Kalender-Objekte, Adressbücher+Adress-Objekte.
*Konsequenz*: Baum-Navigation, PROPFIND- und ACL-Auswertung müssen pro
Domäne implementiert werden (ggf. über eine gemeinsame Interface-/
Basisklasse in `core`, um Duplikation zu begrenzen — Detail für die
Datenmodell-Ausarbeitung).

**Content-Split**: Metadaten (Properties, ETag, ...) und Binärinhalt
liegen in getrennten Tabellen (z.B. `*_metadata` + `*_content` je
Domäne), damit Property-/PROPFIND-Queries keine großen Blobs mitladen.

**Sync-Tracking**: Change-Log-Tabelle pro Collection (Eintrag pro
Änderung: resource_id, Aktion added/modified/deleted, monoton steigende
Sequenznummer je Collection) als Grundlage für RFC6578 sync-collection.

*Status: entschieden* — wird in einem eigenen Datenmodell-Dokument weiter
ausgearbeitet.

---

## 2026-08-30 — ACL/Lock/Sync-Schema (Runde 11)

**ACE/Lock/Change-Log-Tabellen**: ebenfalls pro Ressourcen-Domäne getrennt
(z.B. `collection_aces`/`collection_locks`/`collection_changes`,
`calendar_aces`/`calendar_locks`/`calendar_changes`,
`addressbook_aces`/... ), mit echten FK-Constraints auf die jeweilige
Domänentabelle — statt gemeinsamer generischer Tabellen mit polymorpher
Referenz.
*Begründung*: konsequente Fortsetzung der Domänentrennung aus Runde 10,
Priorität auf referenzielle Integrität auf DB-Ebene.
*Konsequenz*: die ACL-Prüfung, Lock-Verwaltung und Sync-Token-Erzeugung in
`core` müssen als generische, über TypeScript-Interfaces/Basisklassen
parametrisierte Engine gebaut werden, die pro Domäne mit der jeweiligen
Tabelle arbeitet — sonst entsteht 3-6-fach duplizierter Code. Dies ist ein
wiederkehrendes Architekturprinzip für dieses Projekt (siehe Memory
`davnode-domain-separation-preference`): bei zukünftigen Schema-
Entscheidungen ist Domänentrennung mit echten FKs der Standardweg, nicht
generische/polymorphe Tabellen.

*Status: entschieden*

---

## 2026-08-30 — ACE-Ebene, Digest-Credentials, Quota-Tracking (Runde 12)

**ACE-Ebene**: auch auf Objekt-Ebene erlaubt (nicht nur Collection-Ebene).
D.h. 6 ACE-Tabellen (collection_aces, file_aces, calendar_aces,
calendar_object_aces, addressbook_aces, address_object_aces), ACL-
Auswertung in `core` muss geerbte + direkte ACEs mergen.
*Begründung*: volle RFC3744-Flexibilität gewünscht, konsistent mit dem
allgemeinen Muster "vollständige Standardkonformität vor Vereinfachung"
(siehe Memory `davnode-full-compliance-preference`).

**Digest-Auth-Credentials**: separater HA1-Wert
(HA1 = Hash(username:realm:password)) wird zusätzlich zum bcrypt/argon2-
Passwort-Hash gespeichert, wie vom Digest-Standard (RFC 2617/7616)
verlangt.
*Sicherheitshinweis*: HA1 ist kryptographisch schwächer als bcrypt/argon2
(MD5- oder SHA-256-basiert statt salted+iterated) — bewusster Trade-off,
um Digest Auth spezifikationskonform zu unterstützen. Muss beim Schema-
und Security-Review (M12) im Blick behalten werden.

**Quota-Tracking**: Hybrid-Ansatz.
- Laufzeit: laufender Zähler pro User/Tenant (transaktional bei Write/
  Delete aktualisiert) für schnelle Quota-Prüfung.
- Zusätzlich: periodischer Cron-Job zur Nachberechnung/Rekonziliation über
  die tatsächlichen Ressourcen (Korrektur von Zähler-Drift).
- Zusätzlich: manuell anstoßbare Nachberechnung über das Admin-Panel
  (Admin-API, M9).
*Konsequenz*: erfordert einen Job-Scheduler-Mechanismus im Server/Deployment
(→ offene Frage, siehe [03-open-questions.md](03-open-questions.md)).

*Status: entschieden*

---

## 2026-08-30 — Klarstellung "Microsoft-Kompatibilität" (Runde 13)

**Microsoft-Scope**: mit "Besonderheiten von Microsoft" (ursprüngliche
Zielsetzung, Runde 1) ist der **Windows-WebDAV-Mini-Redirector**
(Windows-Explorer-Netzlaufwerk-Client) gemeint — reiner Datei-WebDAV-
Zugriff, **nicht** Outlook/Exchange-Kalender-/Kontakte-Sync (die nutzen
ohnehin kein CalDAV/CardDAV, sondern MAPI/EWS/ActiveSync).
*Konsequenz*: bleibt ein M11-Detail (bekannte Mini-Redirector-Eigenheiten
bei Locking/Headern nachrüsten), kein eigenständiges Großvorhaben.

*Status: entschieden*

---

## 2026-08-30 — Outlook-Kalenderintegration via ICS-Feed (Runde 14)

**Ergänzung zu Runde 13**: über die Windows-WebDAV-Mini-Redirector-
Kompatibilität (M11) hinaus soll es möglich sein, Kalendertermine in
Outlook einzubinden. Da Outlook kein natives CalDAV spricht, wird dafür
**kein** EWS/ActiveSync-Großprojekt begonnen, sondern ein einfacher
**ICS-Feed-Export pro Kalender** angeboten (Internet-Kalender-Abo,
webcal/HTTP-URL, die eine aggregierte `.ics`-Datei liefert).
*Begründung*: nutzt die iCal-Daten, die ohnehin ab M6 vorliegen, mit
geringem Zusatzaufwand. Read-only, periodisches Polling durch Outlook
(kein Echtzeit-Push) — für "Termine in Outlook sehen" ausreichend. Nutzer,
die echtes zwei-Wege-Sync in Outlook wollen, können optional ein
CalDAV-fähiges Outlook-Plugin (z.B. CalDAV Synchronizer) gegen den
regulären CalDAV-Server (M6) verwenden — dafür ist kein weiterer
Server-Zusatzaufwand nötig.
*Konsequenz für die Roadmap*: ICS-Feed-Export wird als Teil von M6
ergänzt (siehe [02-roadmap.md](02-roadmap.md)).
*Offener Detailpunkt*: Authentifizierung der Feed-URL — typische
Kalender-Abo-Clients (auch Outlook) handhaben interaktive Basic-Auth-
Prompts schlecht; üblich ist ein Token-Parameter in der Feed-URL statt
regulärer Basic/Digest-Auth. Wird bei M6-Detailplanung entschieden, siehe
[03-open-questions.md](03-open-questions.md).

*Status: entschieden*

---

## 2026-08-30 — Tenant-URL, Tenant-Quota, Blob-Strategie (Runde 15)

**Tenant-Adressierung**: Pfad-Präfix (`/dav/{tenant}/...`), kein
Subdomain-Routing. Vermeidet Wildcard-DNS/TLS-Komplexität, passt zum
Docker-Self-Hosting-Deployment.

**Tenant-Quota**: zusätzlich zur User-Quota gibt es einen Tenant-weiten
Gesamt-Deckel (`quota_limit_bytes`/`quota_used_bytes` auch auf Tenant).
Beim Schreiben wird gegen **beide** Limits geprüft (User- und
Tenant-Quota).

**Blob-Strategie**: eine Blob-Spalte pro Ressource (kein Chunking in v1).
Ausreichend für die anvisierte Nutzung (privat bis mittleres Unternehmen).
Chunking bleibt eine mögliche spätere Erweiterung, falls Bedarf für sehr
große Dateien entsteht.

*Status: entschieden*

---

## 2026-08-30 — Job-Scheduler (Runde 16)

**Job-Scheduler**: in-process via node-cron (kein separater Cron-
Container, keine Job-Queue/Redis-Abhängigkeit) für v1. Deckt die
periodische Quota-Rekonziliation (M8) ab.
*Bekannte Grenze*: bei künftiger horizontaler Skalierung (mehrere
Server-Instanzen) würde der Job ohne weitere Koordination mehrfach
laufen — für den aktuellen Zielrahmen (privat bis mittleres Unternehmen,
Docker-Single-Instance) akzeptiert, kann bei Bedarf später auf einen
externen Scheduler oder eine Lock-basierte Koordination umgestellt werden.

*Status: entschieden*

---

## 2026-08-31 — Code-Dokumentation & Release-Automatisierung (Runde 17)

**TSDoc-Kommentarpflicht**: alle exportierten Funktionen/Klassen/
Interfaces in `core`/`server`/`admin-api` bekommen TSDoc-Kommentare auf
Englisch (unabhängig davon, dass die Planungsdokumente auf Deutsch sind).
Ziel: spätere automatische API-Doku-Generierung. Wird per ESLint-Regel
durchgesetzt.
*Konsequenz*: weicht bewusst vom sonst üblichen "keine Kommentare außer
bei nicht-offensichtlichem Grund"-Standardverhalten ab — für DavNode gilt
die TSDoc-Pflicht als explizite Projekt-Policy. Siehe
[07-coding-conventions.md](07-coding-conventions.md).

**Doc-Generierung**: TypeDoc als Tool (natives TSDoc-Verständnis,
Monorepo-fähig über mehrere Entry-Points).

**Changelog & Releases**: semantic-release, **eine gemeinsame Version für
das gesamte Repo** (kein Independent-Versioning je Package), da die
Packages aktuell `private` sind und noch nicht unabhängig auf npm
veröffentlicht werden. Basiert auf Conventional Commits, durchgesetzt via
commitlint + Husky commit-msg-Hook. CI-Job (GitHub Actions) führt
semantic-release bei Push auf `main` aus: Versionsbestimmung,
`CHANGELOG.md`-Generierung, Git-Tag, GitHub-Release. **Kein**
npm-Publish-Schritt in v1 (Packages bleiben vorerst `private`).

*Status: entschieden* — konkrete Aufgaben als Big Tasks 6–7 in
[milestones/M0-fundament](../milestones/M0-fundament/00-setting-goal.md)
ergänzt (plus Erweiterung von Big Task 2 um die TSDoc-ESLint-Regel).

---

## 2026-08-31 — Dead Properties & Root-Collection-Bootstrap (Runde 18)

Bei der Detailplanung von M2 (WebDAV Core) wurde eine Lücke im bisherigen
Datenmodell entdeckt: PROPPATCH (RFC 4918) erlaubt Clients, beliebige,
vom Server nicht vordefinierte Properties zu setzen ("dead properties").
Das bisherige Datenmodell hatte dafür keinen Speicherort — nur die festen
Spalten für "live properties" (`displayname`, `getetag`, ...).

**Ergänzung**: `collection_properties`/`file_properties`-Tabellen (Dead
Properties, je Domäne getrennt, konsistent mit der
Domänentrennungs-Präferenz aus Runde 10/11). Details in
[05-data-model.md](05-data-model.md).

**Root-Collection-Bootstrap**: das CLI-Bootstrap-Skript aus M1 (Große
Aufgabe 5) kannte die `Collection`-Entity noch nicht (die existiert erst
ab M2) und hat daher keine WebDAV-Root-Collection angelegt. M2 erweitert
das Skript entsprechend, damit jeder Tenant nach dem Bootstrap eine
Root-Collection (Eigentümer: der Bootstrap-Admin-User) hat.

*Status: entschieden* — konkrete Aufgaben in
[milestones/M2-webdav-core](../milestones/M2-webdav-core/00-setting-goal.md).

---

## 2026-08-31 — Default-Owner-ACE bei Ressourcen-Erzeugung (Runde 19)

Bei der Detailplanung von M3 (WebDAV ACL) wurde eine wichtige
Konsequenz des in Runde 3/10 festgelegten RFC3744-Modells sichtbar:
RFC 3744 ist **default-deny** — ohne passende ACE ist eine Ressource für
niemanden zugänglich, auch nicht für den Eigentümer. Die in M2 gebauten
Ressourcen-Erzeugungs-Pfade (Root-Collection-Bootstrap, MKCOL,
PUT-Neuanlage, COPY) kannten diese Anforderung noch nicht, da die
ACE-Tabellen erst in M3 entstehen.

**Ergänzung**: eine wiederverwendbare `createOwnerAllAce`-Utility (M3,
Große Aufgabe 1, Sub-Task 3) legt bei jeder Ressourcen-Erzeugung
automatisch eine `protected`-ACE an, die dem Eigentümer `DAV:all`
gewährt. Die vier betroffenen M2-Aufgaben wurden nachträglich um einen
Verweis darauf ergänzt (Aufruf dieser Funktion, sobald M3 existiert).

*Status: entschieden* — konkrete Aufgabe in
[milestones/M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md](../milestones/M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md).

---

## 2026-08-31 — CardDAV-Datenmodell & Wiederverwendungs-Retrofits (Runde 20)

Bei der Detailplanung von M5 (CardDAV) wurden mehrere Punkte konkretisiert
bzw. Lücken geschlossen:

**AddressbookCollection ohne Verschachtelung**: anders als die generische
Formulierung "wie Collection" in
[05-data-model.md](05-data-model.md) suggerieren könnte, bekommt
`AddressbookCollection` **kein** selbstreferenzierendes
`parent_collection_id` — Adressbücher verschachteln sich nicht wie
WebDAV-Ordner. Stattdessen liegen alle Adressbücher eines Nutzers flach
unter einer **virtuellen** (nicht in der DB abgebildeten) Home-Collection
`/dav/{tenant}/addressbooks/{userId}/` — analog zur bereits in M3 virtuell
gebauten Principals-Collection-Route. Gleiches Muster gilt später für
`CalendarCollection` (M6).

**vCard-Suchindex**: die in
[05-data-model.md](05-data-model.md) als "zurückgestellt auf M5" markierten
geparsten/indexierten Felder werden als eigene `address_object_index`-
Tabelle umgesetzt (Property-Name/-Wert-Paare, befüllt beim Schreiben),
damit `addressbook-query`-Filter nicht bei jeder Anfrage alle
vCard-Blobs laden und parsen müssen.

**Extended MKCOL (RFC 5689)**: Adressbücher werden — spezifikationskonform
— über einen erweiterten `MKCOL`-Request erzeugt (Body mit
`CARD:addressbook`-Resourcetype), nicht über einen separaten
Server-Admin-Weg. Das erfordert eine Erweiterung des in M2 gebauten
MKCOL-Handlers.

**Wiederverwendungs-Retrofit**: die ACL-Evaluation-Engine (M3) wurde von
Anfang an generisch über den ACE-Tabellentyp gebaut und kann direkt für
`addressbook_aces`/`address_object_aces` instanziiert werden. Die
Lock-Evaluation und der `sync-collection`-Handler (beide M4) waren
dagegen nur "strukturell analog", nicht explizit generisch — beide
werden im Rahmen von M5 nachträglich so verallgemeinert, dass sie über
den Lock-/Change-Log-Tabellentyp parametrisiert werden können (Aufwand,
der sonst bei jeder neuen Domäne erneut anfiele).

*Status: entschieden* — konkrete Aufgaben in
[milestones/M5-carddav](../milestones/M5-carddav/00-setting-goal.md).

---

## 2026-08-31 — CalDAV-Datenmodell, MKCALENDAR & ICS-Feed-Token (Runde 21)

Bei der Detailplanung von M6 (CalDAV) wurden mehrere seit Runde 14/
Datenmodell-Erstfassung offene Punkte konkretisiert:

**CalendarCollection ohne Verschachtelung**: gleiches Muster wie bei
`AddressbookCollection` (Runde 20) — kein `parent_collection_id`,
Kalender liegen flach unter einer virtuellen Home-Collection
`/dav/{tenant}/calendars/{userId}/` (RFC 4791 §5.2.1
`calendar-home-set`).

**Time-Range-Index direkt auf `CalendarObject`, nicht als separate
Tabelle**: anders als bei `AddressObjectIndex` (Runde 20, separate
Tabelle wegen mehrwertiger vCard-Properties wie mehrfacher `EMAIL`)
ist der zeitliche Umfang eines Kalenderobjekts einwertig (ein
`DTSTART`/`DTEND`-Bereich pro Objekt) — daher als direkte Spalten auf
`CalendarObject` (`dtstart`, `dtend`, `is_all_day`,
`recurrence_span_end` [nullable = unbegrenzt wiederkehrend],
`transparency`, `status`), kein unnötiger Join für eine 1:1-Beziehung.
Bewusste Abweichung vom AddressObjectIndex-Muster, mit Begründung.

**MKCALENDAR statt Extended MKCOL**: anders als CardDAV-Adressbücher
(RFC 5689 Extended MKCOL, Runde 20) werden CalDAV-Kalender über die von
RFC 4791 §5.3.1 **eigens definierte** HTTP-Methode `MKCALENDAR` erzeugt
— kein Retrofit von M2s MKCOL nötig, stattdessen ein eigener
Methoden-Handler nach demselben Baumuster wie MKCOL.

**ICS-Feed-Token-Schema** (löst die seit Runde 14 offene Frage): ein
`ics_feed_token`-Feld auf `CalendarCollection` (nullable — Feed ist
deaktiviert, bis erstmals generiert), Token als **Pfadsegment** statt
Query-Parameter (`/dav/{tenant}/calendars/{userId}/{calendarId}/feed/{token}.ics`)
— vermeidet Leakage über `Referer`-Header, die bei
Query-Parameter-Tokens ein bekanntes Risiko sind. Regeneration
invalidiert den alten Token (einfacher Widerruf).

*Status: entschieden* — konkrete Aufgaben in
[milestones/M6-caldav](../milestones/M6-caldav/00-setting-goal.md).

---

## 2026-08-31 — CalDAV-Scheduling-Scope & Default-Kalender (Runde 22)

Bei der Detailplanung von M7 (Scheduling, RFC 6638) wurden folgende
Scope-Entscheidungen getroffen, um die Komplexität eines vollständigen
Scheduling-Systems (das theoretisch Interop mit beliebigen externen
Kalender-Systemen abdecken müsste) auf einen sinnvollen v1-Umfang zu
begrenzen:

**Nur implizites Scheduling**: DavNode erkennt Scheduling automatisch
anhand von PUT/DELETE auf Kalenderobjekte mit `ORGANIZER`/`ATTENDEE`-
Properties (RFC 6638 §7, "Implicit Scheduling") — so arbeiten reale
Clients (Apple Calendar, Thunderbird/Lightning) auch tatsächlich.
**Explizites Scheduling** (Client postet eigenständig eine
iTIP-Nachricht an die Scheduling-Outbox für Einladungen) wird **nicht**
unterstützt — die Outbox wird in v1 ausschließlich für
`freebusy-request`-POSTs genutzt (RFC 6638 §3.4.3).

**Nur lokale Attendees werden real zugestellt**: ist ein `ATTENDEE`
keine `mailto:`/Principal-Adresse eines Nutzers auf **demselben
Tenant**, wird die Einladung zwar im Event gespeichert, aber **nicht**
zugestellt (kein iMIP/E-Mail-Fallback, keine Tenant- oder
Server-übergreifende Zustellung). Bewusst zurückgestellt, siehe
[03-open-questions.md](03-open-questions.md).

**Nur REQUEST/REPLY/CANCEL**: die iTIP-Verhandlungs-Methoden `COUNTER`/
`DECLINECOUNTER`/`ADD` (RFC 5546) werden nicht unterstützt.

**Auto-Filing ohne Opt-out**: eingehende Einladungen werden automatisch
in den (neuen) `default_calendar_id` des Attendees eingetragen — es
gibt in v1 **keine** Einstellung für "nur manuell über die Inbox
triagieren". Dafür wird `User` um `default_calendar_id` (nullable FK →
CalendarCollection) ergänzt, gesetzt bei Anlage des ersten Kalenders
eines Nutzers.

*Status: entschieden* — konkrete Aufgaben in
[milestones/M7-caldav-scheduling](../milestones/M7-caldav-scheduling/00-setting-goal.md).

---

## 2026-08-31 — Admin-Platzhalter-Flag (Runde 23)

Bei der Detailplanung von M8 (Quota-Rekonziliation, manueller
Trigger-Endpunkt) wurde sichtbar, dass es noch **keinen** Weg gibt,
einen Nutzer als "administrativ berechtigt" zu erkennen — ein echtes
Rollenmodell ist erst für die Admin-API (M9) vorgesehen, aber M8
braucht schon vorher einen einfachen Schutz für einen administrativen
Endpunkt.

**Ergänzung**: `User.is_admin` (Boolean, Default `false`) — bewusst
minimaler Platzhalter, **kein** vollständiges Rollen-/
Berechtigungssystem. Wird beim CLI-Bootstrap (M1) für den jeweils
ersten Nutzer eines Tenants auf `true` gesetzt (Retrofit von
[M1-CLI-Bootstrap-Skript](../milestones/M1-kern-datenmodell-tenancy/05-seed-bootstrap-tooling/01-cli-bootstrap-script.md)).
M9 wird dieses Flag durch ein richtiges Rollenmodell ersetzen oder
erweitern — bis dahin ist es die einzige Unterscheidung zwischen
"normalem" und "administrativem" Nutzer.

*Status: entschieden* — siehe
[milestones/M8-quota/05-quota-recompute/02-manual-trigger-endpoint.md](../milestones/M8-quota/05-quota-recompute/02-manual-trigger-endpoint.md).

---

## 2026-08-31 — Admin-API: Rollenmodell, Formfrage, Prozess-Topologie (Runde 24)

Bei der Detailplanung von M9 (Admin-API) wurden mehrere seit Runde 9/23
offene bzw. neu aufgetauchte Punkte konkretisiert:

**Echtes Rollenmodell statt `is_admin`**: `User.is_admin` (Runde 23,
Platzhalter) wird durch `User.role` ersetzt
(`'member' | 'tenant_admin' | 'server_admin'`). `tenant_admin` verwaltet
Nutzer/Gruppen/Quota **innerhalb des eigenen Tenants**, `server_admin`
zusätzlich Tenants selbst (anlegen/löschen) — nötig, weil
Tenant-Erzeugung inhärent eine tenant-übergreifende Operation ist.
Migration: bisherige `is_admin = true`-Zeilen werden zu
`server_admin` (sie stammen ausschließlich vom M1-Bootstrap-Skript, das
den allerersten Operator eines Tenants anlegt).

**Form der Admin-API**: REST mit JSON (nicht RPC, nicht XML wie die
DAV-Schicht) — löst die in
[planning/04-architecture.md](04-architecture.md) offen gelassene Frage.

**Prozess-Topologie**: `@davnode/admin-api` exportiert einen
Express-Router (kein eigener Server/Prozess/Port), den
`@davnode/server` unter `/admin` in dieselbe App einhängt — ein
Deployment-Prozess, konsistent mit der Docker-Single-Container-
Entscheidung aus Runde 1.

**URL-Schema-Eigenheit**: Admin-Routen bleiben aus Auth-Gründen unter
`/admin/{tenantSlug}/...` (Wiederverwendung der bestehenden Tenant-
Resolution-/Basic-Auth-Middleware aus M2 statt neuer Auth-Mechanik).
Bei Tenant-Management-Routen ist `{tenantSlug}` **nur der
Authentifizierungs-Anker** (der Tenant des anfragenden `server_admin`),
**nicht** zwingend der Ziel-Tenant der Operation — bewusst dokumentierte
Eigenheit, siehe [milestones/M9-admin-api](../milestones/M9-admin-api/00-setting-goal.md).

**Destruktive Operationen brauchen Bestätigung**: Tenant- und
User-Löschung (beide kaskadierend, unwiderruflich) verlangen ein
explizites Bestätigungsfeld im Request-Body (Wiederholung des
Slug/Usernamen) — Schutz vor versehentlichem Datenverlust durch einen
einzelnen Fehlklick/Skriptfehler.

*Status: entschieden* — konkrete Aufgaben in
[milestones/M9-admin-api](../milestones/M9-admin-api/00-setting-goal.md).

---

## 2026-08-31 — Scope für erweiterte Auth-Provider (Runde 25)

Bei der Detailplanung von M10 wurden folgende Scope-Entscheidungen
getroffen:

**Digest Auth**: nur SHA-256 (RFC 7616), kein MD5 — konsistent mit der
Sicherheits-Grundhaltung des Projekts. MD5 bleibt eine mögliche
spätere Kompatibilitätsergänzung für ältere Clients.

**OAuth2 = reiner Resource Server**: DavNode validiert ausschließlich
extern ausgestellte JWTs (Validierung über den JWKS-Endpunkt eines
konfigurierten, vertrauenswürdigen OIDC-Providers). Kein eigener
Authorization-Server, kein Login-Screen, keine Token-Ausstellung.
Token-Introspection (RFC 7662) als Alternative zu JWT/JWKS wird nicht
unterstützt.

**Kein JIT-Provisioning**: ein gültiges OAuth2-Token authentifiziert
nur bereits existierende lokale Nutzer, deren externe Identität
(Issuer + `sub`) vorab explizit über die Admin-API (M9) verknüpft
wurde. Kein automatisches Anlegen neuer Nutzer beim ersten Login.

**Nonce-Store in-process**: wie der node-cron-Scheduler (Runde 16) auf
Single-Instance-Deployments ausgelegt; bei künftiger horizontaler
Skalierung müsste er extern liegen.

**Mehrere WWW-Authenticate-Header**: sind mehrere Schemes aktiv, sendet
der Server separate `WWW-Authenticate`-Header-Zeilen statt einer
kommagetrennten (Digest-Parameter enthalten selbst Kommas, was sonst
mehrdeutig wäre).

*Status: entschieden* — konkrete Aufgaben in
[milestones/M10-extended-auth](../milestones/M10-extended-auth/00-setting-goal.md).

---

## 2026-08-31 — M11-Scope & Well-Known-Discovery vs. Multi-Tenancy (Runde 26)

Bei der Detailplanung von M11 wurde ein echter Konflikt zwischen zwei
früheren Entscheidungen sichtbar: RFC 6764 (Service-Discovery über
`/.well-known/caldav`/`/.well-known/carddav`) geht von **einem** Host
ohne Tenant-Segment in der URL aus — unsere Pfad-Präfix-Tenancy
(Runde 15, `/dav/{tenantSlug}/...`) kennt aber keinen Tenant ohne
Pfad-Segment. `User.username` ist zudem nur **pro Tenant** eindeutig
(M1), ein globaler Username-Lookup wäre also mehrdeutig.

**Lösung**: zweistufige Auflösung.
1. Ist `DAVNODE_DEFAULT_TENANT` konfiguriert (typischer Fall: Self-
   Hosting für eine einzelne Organisation), wird **dieser** Tenant für
   `/.well-known/*`-Redirects genutzt, unabhängig vom anfragenden
   Nutzer.
2. Ohne konfigurierten Default (oder als Override): der Nutzername beim
   Basic-Auth-Prompt auf dem Well-Known-Endpunkt muss im Format
   `username@tenantSlug` angegeben werden — der Server löst daraus
   Tenant und Nutzer auf. Nötig für echte Multi-Tenant-Deployments.

Der Well-Known-Endpunkt selbst verlangt — wie jede andere DAV-Ressource
— Basic Auth und leitet danach (`302`) auf die **Principal-URL** des
authentifizierten Nutzers weiter (nicht direkt auf calendar-/addressbook-
home-set) — der Client löst deren `CALDAV:calendar-home-set`/
`CARD:addressbook-home-set`-Properties selbst per PROPFIND auf
(bereits seit M5/M6 vorhanden).

**Weitere M11-Scope-Entscheidungen**:
- Apples proprietäre Calendar-/Contacts-Sharing-Erweiterung (jenseits
  RFC 3744) bleibt bewusst außerhalb von v1 (bereits in
  [03-open-questions.md](03-open-questions.md) vermerkt)
- Google-Kompatibilität wird als offener Recherche-Task behandelt, nicht
  als Liste konkreter Fixes — ohne aktuelle Live-Tests gegen echte
  Google-Clients lassen sich hier keine verlässlichen Annahmen treffen
- litmus/CalDAVtester/CardDAVtester werden jetzt tatsächlich in die
  CI-Pipeline integriert (seit Runde 5 als Ziel vermerkt, bisher nicht
  als eigene Aufgabe konkretisiert)

*Status: entschieden* — konkrete Aufgaben in
[milestones/M11-client-compatibility](../milestones/M11-client-compatibility/00-setting-goal.md).

---

## 2026-08-31 — M12-Scope: Hardening & Produktionsreife (Runde 27)

Bei der Detailplanung von M12 (letzter Roadmap-Meilenstein) wurden
mehrere bisher nicht behandelte Betriebsaspekte konkretisiert:

**TLS-Strategie**: DavNode terminiert TLS **nicht** selbst — die
Produktions-Referenz-Docker-Compose stellt einen Reverse-Proxy (Caddy,
wegen automatischem Let's-Encrypt-Zertifikatsmanagement) vor den
App-Container; DavNode selbst spricht intern nur HTTP. Vermeidet
eigene Zertifikatsverwaltung im Server-Code.

**Backup-Strategie**: da seit Runde 15 **alle** Inhalte (Dateien,
vCards, iCalendar-Objekte) in der Datenbank liegen, ist ein
Datenbank-Backup automatisch ein **vollständiges** Backup — kein
separates Dateisystem-Backup nötig. DavNode implementiert **keinen**
eigenen Backup-Scheduler (Backup-Orchestrierung bleibt Infrastruktur-/
Ops-Aufgabe, wie in Runde 16 bereits für Cron-Jobs allgemein
angedeutet) — stattdessen ein dokumentiertes, getestetes Runbook je
DB-Engine.

**Rate-Limiting entdeckt als Lücke**: bislang existierte **keine**
Drosselung fehlgeschlagener Auth-Versuche (Basic/Digest/OAuth2) — ein
Angreifer könnte Passwörter unbegrenzt durchprobieren. Wird in M12
nachgerüstet: In-Memory-Rate-Limiter pro IP (dieselbe
Single-Instance-Einschränkung wie Nonce-Store/Cron, Runde 16/25).
Schützt **nicht** vor verteilten Angriffen aus vielen IPs — das bleibt
Aufgabe vorgelagerter Infrastruktur (z.B. Fail2ban, WAF).

**Dokumentation**: Code/Doku bleibt Englisch (Runde 17), `planning/`
bleibt internes, deutsches Planungsarchiv — für Nutzer/Contributor
entsteht eine eigenständige englische Doku (README-Erweiterung,
CONTRIBUTING.md), die **nicht** voraussetzt, dass Leser `planning/`
durcharbeiten.

*Status: entschieden* — konkrete Aufgaben in
[milestones/M12-hardening](../milestones/M12-hardening/00-setting-goal.md).

---

<!-- Weitere Einträge werden hier ergänzt -->
