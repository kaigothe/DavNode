# Sub-Task: Lock-Entities

## Kontext
Locks existieren auf Collection- **und** Datei-Ebene (RFC 4918: LOCK
kann jede beliebige Ressourcen-URI adressieren), je Domäne getrennt
konsistent mit dem in M3 etablierten Muster. Siehe
[planning/05-data-model.md](../../../planning/05-data-model.md).

## Aufgabe
- `CollectionLock`-Entity
  (`packages/core/src/entities/collection-lock.entity.ts`): `id` (UUID),
  `collectionId` (FK → Collection), `principalId` (FK → Principal,
  Lock-Inhaber), `token` (String, Format `urn:uuid:<uuid>`, unique),
  `scope` (Enum `'exclusive' | 'shared'`), `depth` (Enum
  `'zero' | 'infinity'` — legt fest, ob der Lock auch für Nachfahren
  gilt, siehe [00-setting-goal.md](../00-setting-goal.md)),
  `timeoutSeconds` (Integer, nullable = `Infinite`), `expiresAt`
  (Timestamp, berechnet aus `timeoutSeconds` — nullable bei `Infinite`),
  `ownerInfo` (Text, das vom Client mitgeschickte `<D:owner>`-Element,
  roh als String gespeichert, wird bei `lockdiscovery` unverändert
  zurückgegeben), `createdAt`
- `FileLock`-Entity analog für `FileResource` (ohne `depth` — eine
  einzelne Datei hat keine Nachfahren, Feld entfällt)
- Migrationen für beide Tabellen; Index auf `token` (schneller Lookup
  bei UNLOCK und bei der `If`-Header-Prüfung)

## Akzeptanzkriterien
- [ ] Migrationen laufen sauber gegen SQLite/Postgres/MySQL
- [ ] `token` ist global unique (nicht nur pro Ressource)
- [ ] `expiresAt` ist `null`, wenn `timeoutSeconds` `null` ist
      (`Infinite`-Lock), sonst korrekt aus `createdAt + timeoutSeconds`
      berechnet

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 4 (Locking-Scope)
