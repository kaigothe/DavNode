# Architektur & Repo-Struktur

Konkretisierung der Entscheidungen aus [01-decisions.md](01-decisions.md)
(Runden 2, 9): Library + Server-Wrapper, 3 Packages, npm Workspaces.

## Monorepo-Layout (Vorschlag)

```
davnode/
├── package.json                # Workspace-Root, npm workspaces config
├── tsconfig.base.json
├── docker-compose.yml
├── Dockerfile
├── .github/workflows/          # CI (GitHub Actions)
├── packages/
│   ├── core/                   # @davnode/core
│   │   ├── src/
│   │   │   ├── entities/       # TypeORM-Entities (Tenant, User, Group,
│   │   │   │                   #   Principal, Collection, CalendarObject,
│   │   │   │                   #   AddressObject, Ace, Lock, SyncToken, ...)
│   │   │   ├── acl/            # RFC3744-Engine (Privileges, ACE-Auswertung)
│   │   │   ├── webdav/         # WebDAV-Methodenlogik (PROPFIND, MKCOL, ...)
│   │   │   ├── caldav/         # CalDAV-spezifische Logik + Scheduling
│   │   │   ├── carddav/        # CardDAV-spezifische Logik
│   │   │   ├── auth/           # Auth-Provider-Interface (core-seitig:
│   │   │   │                   #   Credential-Verifier, Principal-Resolver)
│   │   │   ├── storage/        # Blob-Storage-Abstraktion (DB-Backend)
│   │   │   ├── hooks/          # Extension-Point-Definitionen
│   │   │   └── services/       # Repositories/Use-Cases (auch von admin-api
│   │   │                       #   genutzt)
│   │   └── package.json
│   ├── server/                  # @davnode/server (Express-Wrapper)
│   │   ├── src/
│   │   │   ├── http/           # Express-Routen, DAV-Methoden → core-Aufrufe
│   │   │   ├── auth/           # HTTP-seitige Auth-Mechanik (WWW-Authenticate,
│   │   │   │                   #   Authorization-Header-Parsing für Basic/
│   │   │   │                   #   Digest/Bearer) → ruft core/auth auf
│   │   │   └── config/         # Server-Konfiguration (DB-Verbindung, Ports, ...)
│   │   └── package.json
│   └── admin-api/               # @davnode/admin-api
│       ├── src/
│       │   └── routes/         # Nutzer/Gruppen/Mandanten/Quota-Verwaltung
│       └── package.json
└── docs/                        # öffentliche Projekt-Doku (später)
```

## Schichtung / Abhängigkeitsrichtung
- `core` hat **keine** Abhängigkeit zu Express oder HTTP-Spezifika. Enthält
  die komplette Protokoll-/ACL-/Datenlogik und ist so auch außerhalb von
  DavNode als Baustein nutzbar (Ziel: "Grundlage für andere OSS").
- `server` und `admin-api` hängen von `core` ab, nicht umgekehrt.
- `server` und `admin-api` teilen sich dieselben `core`-Services/
  Repositories (keine Doppelimplementierung von Geschäftslogik).
- **Prozess-Topologie** (Runde 24): `admin-api` exportiert einen
  Express-`Router` (kein eigener Server/Port) — `server` bindet ihn in
  `app.ts` unter `/admin` in denselben Prozess ein. Ein Deployment-
  Prozess, konsistent mit dem Docker-Single-Container-Ansatz (Runde 1).
  Form: REST mit JSON (nicht RPC, nicht das DAV-XML-Format).

## Auth-Schnittstellen-Split (Ableitung aus "pluggable Auth")
- **core/auth**: definiert das Provider-Interface (z.B. „verifiziere
  Credentials/Token → liefere Principal oder null"), unabhängig von HTTP.
- **server/auth**: HTTP-Mechanik pro Schema (Parsen von
  `Authorization`-Headern, Erzeugen von `WWW-Authenticate`-Challenges für
  Basic/Digest, Bearer-Token-Extraktion) — ruft dafür in `core/auth`
  hinein.
- Neue Auth-Mechanismen (z.B. LDAP/OIDC über Hooks, M10) implementieren nur
  das core-seitige Interface.

## Offene Detailpunkte
Siehe [03-open-questions.md](03-open-questions.md) — insbesondere genaues
Entity-Design, Principal-URL-Schema und Blob-Handling je DB-Engine.
