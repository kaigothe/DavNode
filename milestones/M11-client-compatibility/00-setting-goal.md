# M11 — Client-Kompatibilität

## Setting (Kontext)
M0–M10 haben einen standards-konformen WebDAV/CalDAV/CardDAV-Server
gebaut. M11 ist die in Runde 1 angekündigte zweite Phase: "später auch
die Besonderheiten von Google, Apple und Microsoft" — jetzt, wo die
Kern-Standards vollständig stehen, werden gezielt bekannte
Client-Eigenheiten nachgerüstet.

**Anders als M0–M10 ist M11 nicht vollständig im Voraus spezifizierbar.**
Ein Teil der Aufgaben (RFC-6764-Discovery, `getctag`, vCard-3.0-
Toleranz, `MS-Author-Via`-Header) ist konkret planbar. Ein anderer Teil
(Google-Kompatibilität insbesondere) hängt von **Live-Tests gegen
echte, aktuelle Client-Versionen** ab, die sich seit dem
Planungszeitpunkt geändert haben können — hier wird der Task bewusst
als "Recherche + Anpassung" statt als Liste konkreter Fixes formuliert.

**Wichtiger Konflikt aufgelöst** (Runde 26, siehe
[planning/01-decisions.md](../../planning/01-decisions.md)): RFC 6764
(Service-Discovery über `/.well-known/caldav`/`carddav`) geht von einem
Host ohne Tenant im Pfad aus — unsere Pfad-Präfix-Multi-Tenancy
(Runde 15) braucht aber einen Tenant. Lösung: `DAVNODE_DEFAULT_TENANT`
für den Ein-Tenant-Regelfall, `username@tenantSlug`-Format als
Fallback für echte Multi-Tenant-Deployments.

## Ziel
Am Ende von M11 funktioniert die "einfach E-Mail/Server + Passwort
eingeben"-Ersteinrichtung in Apple Calendar/Contacts, Thunderbird und
DAVx5 (RFC-6764-Discovery), Apple-Clients zeigen Änderungen ohne volle
Neusynchronisation an (`getctag`), CardDAV-Clients, die noch vCard 3.0
senden, scheitern nicht, Windows Explorer bietet WebDAV-Netzlaufwerke
korrekt zum Bearbeiten an, und litmus/CalDAVtester/CardDAVtester laufen
automatisiert in CI.

## Große Aufgaben (Übersicht)
1. [RFC-6764-Discovery](01-well-known-discovery/00-overview.md)
2. [Apple-Kompatibilität](02-apple-compatibility/00-overview.md)
3. [vCard-3.0-Kompatibilität](03-vcard3-compatibility/00-overview.md)
4. [Windows-Mini-Redirector-Kompatibilität](04-windows-miniredir-compatibility/00-overview.md)
5. [Google-Kompatibilität](05-google-compatibility/00-overview.md)
6. [Konformitätstest-Suiten in CI](06-conformance-suite-ci/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: 1–4 und 6 sind konkret umsetzbar
und sollten zuerst kommen; 5 (Google) braucht vorab Recherchezeit und
kann parallel dazu laufen.

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M11-Definition
- [planning/06-standards-compliance.md](../../planning/06-standards-compliance.md) — Client-Kompatibilität-Abschnitt
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 1, 13, 26

## Abgrenzung (nicht Teil von M11)
- Apples proprietäre Calendar-/Contacts-Sharing-Erweiterung (jenseits
  RFC 3744) — siehe [planning/03-open-questions.md](../../planning/03-open-questions.md)
- MD5-Digest (siehe M10-Abgrenzung) — kann bei Bedarf hier nachgezogen
  werden, falls reale Tests zeigen, dass ein wichtiger Client SHA-256-
  Digest nicht unterstützt
- `expand-property`-REPORT (RFC 3253) — weiterhin zurückgestellt
- Jegliche Outlook-Kalender-/Kontakte-Integration jenseits des in M6
  gebauten ICS-Feeds (siehe Runde 13/14 — Outlook spricht kein
  natives CalDAV/CardDAV)
