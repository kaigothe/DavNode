# Sub-Task: Password-Set-Hook & Admin-Password-Reset

## Kontext
**Bei der M10-Detailplanung entdeckte Lücke**: `digest_ha1` muss bei
**jedem** Setzen eines Passworts mitberechnet werden (HA1 hängt vom
Klartext-Passwort ab), aber der einzige bisher existierende Ort, an dem
ein Passwort gesetzt wird, ist
[M1s UserService.createUser](../../../M1-kern-datenmodell-tenancy/04-repository-service-layer/02-user-service.md)
(bei der Erstanlage). Es gibt bislang **gar keinen** Weg, das Passwort
eines bestehenden Nutzers zu ändern — weder für Digest noch für Basic.
[M9s User-CRUD](../../../M9-admin-api/04-user-management/01-user-crud.md)
deckt bewusst nur Self-Service **aus** (siehe dortige Abgrenzung), aber
ein administrativer Passwort-Reset ("Nutzer hat Passwort vergessen") ist
davon unabhängig und fehlt bisher komplett.

## Aufgabe
- `UserService.createUser` (M1) erweitern: berechnet — sofern Digest
  Auth serverseitig aktiviert ist (siehe
  [Provider-Verwaltung](../../06-provider-management/00-overview.md))
  — zusätzlich zum bcrypt/argon2-Hash das `digest_ha1` (via
  `H(username:realm:password)`, `realm` aus der Server-Konfiguration)
  und legt eine zweite `Credential`-Zeile (`type: 'digest'`) an
- Neue Funktion `setUserPassword(userId, newPassword)` in `core`, die
  **beide** Credential-Typen (`basic` und ggf. `digest`) konsistent
  aktualisiert (nie nur eine der beiden vergisst)
- Neuer Admin-API-Endpunkt (Retrofit von
  [M9-User-Management](../../../M9-admin-api/04-user-management/00-overview.md)):
  `POST /admin/{tenantSlug}/users/{userId}/password` — setzt ein neues
  Passwort, nutzt `setUserPassword`; erfordert `tenant_admin` (eigener
  Tenant) oder `server_admin`

## Akzeptanzkriterien
- [ ] Neuanlage eines Nutzers bei aktiviertem Digest legt sowohl
      `basic`- als auch `digest`-`Credential` an
- [ ] Admin-Passwort-Reset aktualisiert **beide** Credential-Typen
      konsistent — nach dem Reset funktioniert sowohl Basic- als auch
      Digest-Login mit dem neuen Passwort, keines mit dem alten
- [ ] Ist Digest **nicht** aktiviert, wird keine `digest`-Credential
      angelegt (kein unnötiger HA1 im Klartext-Umfeld gespeichert)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 12, 25
