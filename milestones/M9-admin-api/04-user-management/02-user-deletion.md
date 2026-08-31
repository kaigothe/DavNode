# Sub-Task: User-Löschung

## Kontext
Kleinerer Blast-Radius als die Tenant-Löschung (Große Aufgabe 3), aber
dieselbe Cascade-Strategie: `owner_principal_id`-Fremdschlüssel über
alle drei Domänen (Collections, Objects, ACEs als `principal_id`,
`GroupMembership`) auf `ON DELETE CASCADE` prüfen, damit das Löschen
eines `User`/`Principal` alle davon abhängigen Zeilen automatisch
mitnimmt.

**Wichtiger Seiteneffekt, der leicht übersehen wird**: eine DB-seitige
`CASCADE`-Löschung läuft **nicht** durch `applyQuotaDelta` (M8) — die
Tenant-`quota_used_bytes` würde nach dem Löschen eines Nutzers mit viel
Inhalt **veraltet** (zu hoch) bleiben, bis der nächste Cron-Lauf das
korrigiert. Das wird hier explizit behoben.

## Aufgabe
- `DELETE /admin/{tenantSlug}/users/{userId}` — erfordert
  `{ "confirmUsername": "..." }` im Body (analog zur Tenant-Löschung)
- Nach der Cascade-Löschung: `recomputeQuotaForTenant` (aus
  [M8-Rekonziliations-Job](../../../M8-quota/05-quota-recompute/01-reconciliation-job.md))
  wird **synchron** am Ende desselben Requests aufgerufen, damit
  `quota_used_bytes` sofort korrekt ist, nicht erst beim nächsten
  Cron-Lauf
- Ist der zu löschende Nutzer `default_calendar_id` für **sich selbst**
  (üblich) — kein Sonderfall, verschwindet mit ihm. Ist er
  `owner_principal_id` fremder `GroupMembership`-Einträge (Mitglied
  in Gruppen) — diese Mitgliedschaften werden mitentfernt (Cascade),
  betroffene Gruppen bleiben bestehen
- Der zu löschende Nutzer darf **nicht** der letzte verbleibende
  `server_admin` der Instanz sein (Sicherheitsnetz gegen
  "sich selbst aussperren") → `409` in diesem Fall

## Akzeptanzkriterien
- [ ] Löschung eines Nutzers mit Dateien/Kontakten/Terminen entfernt
      alle davon (Cascade), Tenant-`quota_used_bytes` ist **unmittelbar
      danach** korrekt (kein Warten auf den Cron-Job nötig)
- [ ] Request ohne/mit falschem `confirmUsername` liefert `400`
- [ ] Löschung des letzten `server_admin` der Instanz liefert `409`
- [ ] Gruppen, in denen der gelöschte Nutzer Mitglied war, bleiben mit
      den übrigen Mitgliedern bestehen

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 24
