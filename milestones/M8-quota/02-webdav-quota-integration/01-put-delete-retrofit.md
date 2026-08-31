# Sub-Task: PUT/DELETE/COPY-Retrofit

## Kontext
**Retrofit von M2**: erweitert
[PUT](../../../M2-webdav-core/06-resource-crud/03-put.md),
[DELETE](../../../M2-webdav-core/06-resource-crud/04-delete.md) und
[COPY](../../../M2-webdav-core/07-copy-move/01-copy.md) um Aufrufe der
[applyQuotaDelta-Funktion](../../01-quota-counter-utility/01-apply-quota-delta.md).
**MOVE braucht keine Anpassung** — der Eigentümer und damit die
Quota-Zuordnung bleiben unverändert (siehe
[M2-MOVE](../../../M2-webdav-core/07-copy-move/02-move.md), "Owner
bleibt erhalten"), es entsteht kein neuer Inhalt.

## Aufgabe
- **PUT Neuanlage**: `applyQuotaDelta` mit `deltaBytes = +sizeBytes`,
  `userId`/`tenantId` des anfragenden Principals — **vor** dem
  eigentlichen Schreiben von `FileContent` in derselben Transaktion
  aufrufen; bei `QuotaExceededError` Transaktion abbrechen, `507`
- **PUT Überschreiben**: `deltaBytes = neueGröße - alteGröße` (kann
  negativ sein); `userId`/`tenantId` des **Eigentümers der bestehenden
  Ressource** (nicht zwingend der aktuell schreibende Principal, falls
  Rechte das erlauben — Quota wird dem Eigentümer angelastet)
- **DELETE**: `deltaBytes = -sizeBytes`; bei Collections **rekursiv**
  die Summe aller enthaltenen `FileContent`-Größen (eine
  `applyQuotaDelta`-Aufruf pro betroffenem Owner, falls eine Collection
  Dateien unterschiedlicher Eigentümer enthält — Gruppierung nach
  `owner_principal_id`/`tenant_id` vor dem Aufruf)
- **COPY**: die Kopie gehört dem anfragenden Principal (M2-Regel) → wie
  eine PUT-Neuanlage behandeln, `deltaBytes = +sizeBytes` je kopierter
  Datei, dem anfragenden Principal angelastet — bei rekursivem Copy
  (`Depth: infinity`) Summe aller kopierten Dateien
- 507-Antwort enthält (best effort) einen Hinweis, ob User- oder
  Tenant-Limit betroffen war (aus `QuotaExceededError`), ohne
  sicherheitsrelevante Details preiszugeben (z.B. nicht die genaue
  Limit-Höhe eines fremden Tenants)

## Akzeptanzkriterien
- [ ] PUT einer neuen Datei, die das User-Limit überschreiten würde,
      liefert `507`, **keine** Datei wird angelegt (Transaktions-
      Rollback-Test)
- [ ] PUT-Überschreiben mit kleinerer neuer Datei reduziert
      `quota_used_bytes` korrekt, auch wenn der User nahe am Limit ist
- [ ] DELETE einer Collection mit mehreren Dateien reduziert
      `quota_used_bytes` um die Summe aller enthaltenen Dateigrößen
- [ ] COPY, das das Tenant-Limit überschreiten würde, liefert `507`,
      keine Kopie wird angelegt
- [ ] MOVE verändert `quota_used_bytes` **nicht** (Regressionstest)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 12, 15
