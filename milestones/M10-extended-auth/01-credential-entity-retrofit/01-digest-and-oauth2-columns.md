# Sub-Task: Digest- & OAuth2-Spalten

## Kontext
[M1-Credential-Entity](../../../M1-kern-datenmodell-tenancy/02-credential-auth-interface/01-credential-entity.md)
hat `type` bereits als erweiterbares Enum angelegt (`'basic'` bisher
einziger genutzter Wert) — jetzt werden `'digest'` und `'oauth2'`
tatsächlich nutzbar.

## Aufgabe
- Migration: `Credential` um `digestHa1` (nullable, String — nur bei
  `type = 'digest'` gesetzt), `digestRealm` (nullable, String),
  `oauth2Issuer` (nullable, String — Issuer-URL des IdP),
  `oauth2Subject` (nullable, String — `sub`-Claim) ergänzen
- Unique-Index auf `(oauth2_issuer, oauth2_subject)` — dieselbe externe
  Identität darf nicht mit zwei verschiedenen lokalen `User`n verknüpft
  sein
- Bestehender Unique-Index `(user_id, type)` aus M1 bleibt unverändert
  gültig (ein `User` kann weiterhin höchstens ein `Credential` je Typ
  haben)

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite/Postgres/MySQL, bestehende
      `basic`-Credentials bleiben unverändert nutzbar (Regressionstest
      gegen M1/M2-Basic-Auth-Tests)
- [ ] Zwei `Credential`-Zeilen mit identischem `(oauth2_issuer,
      oauth2_subject)` werden vom Unique-Index abgelehnt

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Core/Tenancy
