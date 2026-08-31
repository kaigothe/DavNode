# Sub-Task: applyQuotaDelta-Funktion

## Kontext
Race-freie Limit-Durchsetzung ist der Kernpunkt dieser Milestone (siehe
[00-setting-goal.md](../../00-setting-goal.md)). Diese Funktion wird von
**jedem** Schreibpfad (PUT/DELETE in allen drei Domänen) innerhalb
derselben DB-Transaktion wie der eigentliche Content-Schreibvorgang
aufgerufen.

## Aufgabe
- `packages/core/src/quota/apply-quota-delta.ts`: Funktion
  `applyQuotaDelta(entityManager, { userId, tenantId, deltaBytes }): Promise<void>`
  (nimmt den TypeORM-`EntityManager` der **laufenden Transaktion**
  entgegen, öffnet **keine** eigene)
- Zwei atomare, bedingte `UPDATE`-Statements in Folge (beide innerhalb
  derselben Transaktion):
  1. `UPDATE users SET quota_used_bytes = quota_used_bytes + :delta
     WHERE id = :userId AND (quota_limit_bytes IS NULL OR
     quota_used_bytes + :delta <= quota_limit_bytes)`
  2. Analog auf `tenants`
- Betrifft eines der beiden Updates **0 Zeilen** (Limit würde
  überschritten): Funktion wirft eine dedizierte `QuotaExceededError`
  (mit Info, welche Ebene — User oder Tenant — betroffen ist) — der
  Aufrufer fängt diese Exception, lässt die Transaktion rollbacken
  (inkl. eines eventuell bereits erfolgreichen User-Updates, falls das
  Tenant-Update scheitert) und antwortet `507 Insufficient Storage`
- `deltaBytes` kann **negativ** sein (Löschen/Verkleinern) — negative
  Deltas werden **nie** durch die Limit-Bedingung blockiert (die
  Bedingung greift nur, wenn der neue Wert das Limit überschreiten
  würde, was bei einer Verkleinerung nie der Fall ist)
- `quota_limit_bytes IS NULL` bedeutet "kein Limit" — Update geht immer
  durch

## Akzeptanzkriterien
- [ ] Ein Delta, das das User-Limit überschreiten würde, wirft
      `QuotaExceededError`, **kein** Zähler wird verändert (Transaktion
      muss vom Aufrufer zurückgerollt werden — Test prüft, dass nach
      einem fehlgeschlagenen Versuch beide Zähler unverändert sind)
- [ ] Ein Delta unterhalb beider Limits aktualisiert beide Zähler
      korrekt
- [ ] **Race-Test**: zwei simulierte parallele Aufrufe, die zusammen
      das Limit überschreiten würden, aber einzeln nicht — genau einer
      schlägt fehl, der andere gelingt (kein doppeltes Durchrutschen)
- [ ] Negative Deltas werden nie durch ein Limit blockiert, auch wenn
      `quota_used_bytes` dadurch nicht unter `0` fallen könnte (Floor
      bei `0` als zusätzliche Absicherung gegen negative Zähler durch
      Drift)
- [ ] `quota_limit_bytes = NULL` (kein Limit) lässt beliebig große
      Deltas durch

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Quota-Abschnitt
