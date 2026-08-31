# Sub-Task: Nonce-Store

## Kontext
Verhindert Replay-Angriffe (dasselbe `nonce`+`nc`-Paar zweimal
verwenden) und ermöglicht `stale=true`-Antworten (abgelaufener Nonce,
Client kann transparent mit neuem Nonce erneut senden, **ohne** den
Nutzer erneut nach dem Passwort zu fragen). In-process, wie in
[00-setting-goal.md](../../00-setting-goal.md) begründet.

## Aufgabe
- `packages/core/src/auth/digest-nonce-store.ts`: In-Memory-`Map`
  (`nonce → { issuedAt, expiresAt, highestNc }`)
- `generateNonce(): string` — kryptographisch zufällig (nicht
  vorhersagbar), plus `expiresAt` (Default-TTL z.B. 5 Minuten,
  konfigurierbar)
- `validateAndConsumeNonce(nonce, nc): 'valid' | 'stale' | 'replay' | 'unknown'`
  — `nonce` nicht im Store → `'unknown'`; abgelaufen → `'stale'`;
  `nc` ≤ `highestNc` für diesen Nonce → `'replay'`; sonst: `highestNc`
  aktualisieren, `'valid'`
- **Lazy Expiry** wie bei den Locks aus M4: abgelaufene Einträge werden
  bei Zugriff als ungültig behandelt, kein Cleanup-Job für die
  Korrektheit nötig. Für den Arbeitsspeicher-Verbrauch über lange
  Laufzeit trotzdem ein leichtgewichtiger periodischer Sweep (kann den
  node-cron-Mechanismus aus M0/M8 mitnutzen), der tatsächlich
  abgelaufene Einträge aus der Map entfernt

## Akzeptanzkriterien
- [ ] Ein frischer Nonce mit `nc = 1` ist `'valid'`, eine Wiederholung
      mit demselben `nc` ist `'replay'`
- [ ] Ein abgelaufener Nonce liefert `'stale'`, nicht `'unknown'`
      (Unterscheidung wichtig für die HTTP-Antwort, siehe
      [Große Aufgabe 3](../../03-digest-auth-http/00-overview.md))
- [ ] Ein nie ausgegebener Nonce liefert `'unknown'`
- [ ] Der periodische Sweep entfernt abgelaufene Einträge tatsächlich
      aus der Map (Speicher-Test: Map-Größe wächst nicht unbegrenzt bei
      vielen abgelaufenen Nonces)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 7616 §3.3
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 16 (node-cron), Runde 25
