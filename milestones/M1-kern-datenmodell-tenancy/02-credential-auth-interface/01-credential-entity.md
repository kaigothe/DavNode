# Sub-Task: Credential-Entity

## Kontext
Pluggable Auth-Architektur: mehrere Credential-Typen pro User möglich
([planning/05-data-model.md](../../../planning/05-data-model.md)). In M1
wird **nur** der `basic`-Typ tatsächlich befüllt — Digest- und
OAuth2-spezifische Spalten kommen erst mit ihren jeweiligen Meilensteinen
(M10) dazu, um jetzt keine ungenutzten Felder anzulegen (siehe
Abgrenzung in [00-setting-goal.md](../00-setting-goal.md)).

## Aufgabe
- `Credential`-Entity in
  `packages/core/src/entities/credential.entity.ts`: `id` (UUID),
  `userId` (FK → User), `type` (Enum, aktuell nur `'basic'` als
  gültiger Wert, aber als String-Enum angelegt, damit `'digest'`/
  `'oauth2'` in M10 ergänzt werden können ohne Spaltentyp-Änderung),
  `passwordHash` (nullable — nur bei `type = 'basic'` gesetzt),
  `createdAt`, `updatedAt`
- Migration für `credentials`-Tabelle, FK auf `users`, Index auf
  `user_id`
- Ein User kann **mehrere** Credentials unterschiedlichen Typs haben,
  aber nicht zwei vom selben Typ (Unique-Index auf `(user_id, type)`)

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite
- [ ] `(user_id, type)` ist unique
- [ ] `passwordHash` wird nirgends im Klartext geloggt (Code-Review-
      Punkt, kein automatischer Test nötig, aber im PR-Review zu prüfen)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Core/Tenancy
