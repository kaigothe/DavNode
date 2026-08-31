# M5 — CardDAV (RFC 6352)

## Setting (Kontext)
M2–M4 haben einen vollständigen WebDAV-Server (Class 1+2, ACL, Sync)
gebaut. M5 ist der erste Meilenstein einer **neuen Ressourcen-Domäne**
(Adressbücher/Kontakte statt Dateien) und damit ein wichtiger Test dafür,
wie gut die bisherige Architektur trägt: die ACL-Evaluation-Engine (M3)
wurde von Anfang an generisch gebaut, genau damit sie hier ohne
Neubau wiederverwendet werden kann. Locking (M4) war das nur teilweise
und wird im Rahmen von M5 nachträglich generisch gemacht.

**Wichtige Klarstellung des Datenmodells** (Runde 20): Adressbücher
verschachteln sich — anders als WebDAV-Ordner — nicht. Alle Adressbücher
eines Nutzers liegen flach unter einer **virtuellen**
Home-Collection `/dav/{tenant}/addressbooks/{userId}/` (RFC 6352 §7.1.1),
analog zur bereits in M3 virtuell gebauten Principals-Collection.

## Retrofit-Übersicht (was diese Milestone in M2–M4 nachträglich anfasst)
- **M2 MKCOL** wird um Extended-MKCOL-Erkennung (RFC 5689,
  `CARD:addressbook`-Resourcetype) erweitert
- **M3 Principals-Collection-Route** liefert jetzt zusätzlich
  `CARD:addressbook-home-set` (wurde in M3 bereits über die
  Property-Provider-Registry vorbereitet, kein Umbau nötig)
- **M4 Lock-Evaluation** (`collect-locks.ts`) wird generisch über den
  Lock-Tabellentyp gemacht (Retrofit, siehe
  [M4-Lock-Evaluation](../M4-locking-sync/02-lock-evaluation/00-overview.md))
- **M4 sync-collection-Handler** bekommt eine
  Change-Log-Repository-Abstraktion (Retrofit, siehe
  [M4-sync-collection-Handler](../M4-locking-sync/07-sync-collection-report/02-sync-collection-handler.md))

Alle vier Retrofits sind in den jeweiligen M2/M3/M4-Dateien selbst als
"Nachtrag"-Abschnitt dokumentiert.

## Ziel
Am Ende von M5 können CardDAV-fähige Clients (Apple Contacts,
Thunderbird, DAVx5) Adressbücher unter ihrer Home-Collection anlegen
(Extended MKCOL), Kontakte per GET/PUT/DELETE verwalten, per
`addressbook-query`/`addressbook-multiget` REPORT filtern/abrufen, und
dabei von derselben ACL-, Lock- und Sync-Infrastruktur wie die
WebDAV-Domäne profitieren.

## Große Aufgaben (Übersicht)
1. [Addressbook-Domänen-Entities](01-addressbook-domain-entities/00-overview.md)
2. [vCard-Parsing & Suchindex](02-vcard-parsing-and-index/00-overview.md)
3. [Addressbook-Home & Extended-MKCOL](03-addressbook-home-and-extended-mkcol/00-overview.md)
4. [AddressObject-CRUD](04-address-object-crud/00-overview.md)
5. [ACL-/Lock-/Sync-Wiederverwendung](05-acl-lock-sync-reuse/00-overview.md)
6. [CardDAV-REPORTs](06-carddav-reports/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→6).

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M5-Definition
- [planning/05-data-model.md](../../planning/05-data-model.md) — Addressbook-Domäne, URL-Schema
- [planning/06-standards-compliance.md](../../planning/06-standards-compliance.md) — RFC 6352, RFC 6350, RFC 5689
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 20

## Abgrenzung (nicht Teil von M5)
- Kein CalDAV (M6) — auch wenn CalendarCollection später dasselbe
  Home-Collection-Muster übernimmt, wird das erst in M6 gebaut
- Volle vCard-3.0-Client-Kompatibilitätsarbeit bleibt M11 vorbehalten
  (siehe [planning/06-standards-compliance.md](../../planning/06-standards-compliance.md));
  M5 parst vCard 3.0 und 4.0 nur so weit, dass gängige Clients nicht
  sofort scheitern — keine vollständige Versions-Konvertierung
- Kein `expand-property`-REPORT (weiterhin zurückgestellt, siehe
  [planning/03-open-questions.md](../../planning/03-open-questions.md))
