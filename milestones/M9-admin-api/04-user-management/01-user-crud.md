# Sub-Task: User-CRUD

## Kontext
Nutzt
[UserService aus M1](../../../M1-kern-datenmodell-tenancy/04-repository-service-layer/02-user-service.md).

## Aufgabe
- `POST /admin/{tenantSlug}/users` — legt einen neuen Nutzer in
  `{tenantSlug}` an (`username`, `email`, `password`, optional `role`)
- `GET /admin/{tenantSlug}/users` — listet alle Nutzer des Tenants
- `GET /admin/{tenantSlug}/users/{userId}` — Details (**ohne**
  Credential-Hash im Response-Body)
- `PATCH /admin/{tenantSlug}/users/{userId}` — aktualisiert `email`,
  `quotaLimitBytes`, `role`
- **Privilege-Escalation-Schutz**: ein `tenant_admin` darf beim Anlegen/
  Aktualisieren eines Nutzers `role` nur auf `'member'` oder
  `'tenant_admin'` setzen, **niemals** `'server_admin'` — Versuch
  liefert `403`. Nur ein `server_admin` darf `server_admin`-Rechte
  vergeben

## Akzeptanzkriterien
- [ ] `POST` legt Nutzer inkl. Credential an (Cross-Check mit
      M1-Verhalten)
- [ ] `GET`-Responses enthalten niemals `password_hash`/`digest_ha1`
- [ ] `tenant_admin`, der versucht, einen Nutzer zu `server_admin` zu
      machen, bekommt `403`, Rolle bleibt unverändert
- [ ] `server_admin` kann `server_admin`-Rechte vergeben

## Nachtrag (Runde 25, sobald M10 existiert)
Bei der M9-Planung fehlt ein Weg, das Passwort eines **bestehenden**
Nutzers zu ändern (nur Neuanlage setzt eines). Sobald
[M10 — Erweiterte Auth-Provider](../../M10-extended-auth/00-setting-goal.md)
existiert, ergänzt
[M10-Password-Set-Hook](../../M10-extended-auth/01-credential-entity-retrofit/02-password-set-hook-and-admin-reset.md)
einen `POST /admin/{tenantSlug}/users/{userId}/password`-Endpunkt.

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 24, 25
