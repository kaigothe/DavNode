# M9 — Admin-/Management-API

## Setting (Kontext)
`@davnode/admin-api` existiert seit M0 nur als Platzhalter-Package (ein
`VERSION`-Export). M9 füllt es mit echter Funktionalität: Verwaltung
von Tenants, Nutzern, Gruppen und Quota — **ohne** die Geschäftslogik
zu duplizieren, die bereits in `core` liegt (M1s `TenantService`/
`UserService`/`GroupService`/`GroupMembershipService`, M8s
Quota-Rekonziliation).

**Wichtigste Entscheidungen aus der M9-Detailplanung** (Runde 24, siehe
[planning/01-decisions.md](../../planning/01-decisions.md)):

1. **Echtes Rollenmodell statt `is_admin`**: `User.is_admin`
   (M8-Platzhalter, Runde 23) wird durch `User.role`
   (`'member' | 'tenant_admin' | 'server_admin'`) ersetzt.
   `tenant_admin` verwaltet **nur den eigenen Tenant**, `server_admin`
   zusätzlich Tenants selbst.

2. **Form**: REST mit JSON — bewusst **nicht** dasselbe XML-Format wie
   die DAV-Schicht, da die Admin-API kein WebDAV-Client-Ziel ist.

3. **Prozess-Topologie**: `admin-api` exportiert einen Express-`Router`,
   `server` mountet ihn unter `/admin` im selben Prozess — kein
   separater Server/Port.

4. **URL-Eigenheit**: alle Admin-Routen liegen unter
   `/admin/{tenantSlug}/...`, um die bestehende Tenant-Resolution-/
   Basic-Auth-Middleware aus M2 unverändert wiederzuverwenden. Bei
   Tenant-Management-Routen (Große Aufgabe 3) ist `{tenantSlug}` **nur
   der Authentifizierungs-Anker** des anfragenden `server_admin` — die
   eigentliche Zieltenant-Operation (z.B. eine **andere** Tenant
   anlegen) ist davon unabhängig. Bewusst etwas unüblich, aber
   vermeidet eine zweite Auth-Mechanik nur für tenant-lose Routen.

5. **Bestätigungspflicht bei destruktiven Operationen**: Tenant- und
   User-Löschung verlangen ein Bestätigungsfeld im Body (Slug/Username
   wiederholen) — beide sind kaskadierend und unwiderruflich.

## Ziel
Am Ende von M9 kann ein `server_admin` per REST-API neue Tenants
anlegen, ein `tenant_admin` Nutzer/Gruppen seines Tenants verwalten und
Quota-Limits einsehen/rekonziliieren — alles ohne direkten DB-Zugriff
oder das M1-CLI-Skript. Das CLI-Bootstrap-Skript aus M1 bleibt für die
**allererste** Tenant-Erzeugung (Henne-Ei-Problem: ohne Tenant/Nutzer
kein authentifizierter API-Zugriff) weiterhin nötig.

## Große Aufgaben (Übersicht)
1. [Rollenmodell](01-role-model/00-overview.md)
2. [Admin-API-Grundgerüst](02-admin-api-scaffold/00-overview.md)
3. [Tenant-Management](03-tenant-management/00-overview.md)
4. [User-Management](04-user-management/00-overview.md)
5. [Group-Management](05-group-management/00-overview.md)
6. [Quota-Management](06-quota-management/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→6).

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M9-Definition
- [planning/04-architecture.md](../../planning/04-architecture.md) — Prozess-Topologie, Form
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 9, 23, 24

## Abgrenzung (nicht Teil von M9)
- Keine Admin-Weboberfläche (nur die REST-API selbst)
- Kein Nutzer-Self-Service (Passwort selbst ändern, eigenes Profil
  bearbeiten) — M9 ist für **Admins, die andere verwalten**, nicht für
  Nutzer, die sich selbst verwalten; als mögliche spätere Ergänzung
  vermerkt, siehe [planning/03-open-questions.md](../../planning/03-open-questions.md)
- Kein Soft-Delete/Papierkorb für gelöschte Tenants/Nutzer — Löschung
  ist endgültig (mit Bestätigungspflicht als einzigem Schutz)
