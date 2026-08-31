# Sub-Task: collect-locks & Konflikt-Prüfung

## Kontext
Strukturell analog zu `collect-aces.ts` aus M3
([ACE-Sammlung mit Vererbung](../../M3-webdav-acl/03-acl-evaluation-engine/01-ace-collection-with-inheritance.md)):
statt Rechte zu vererben, vererben Vorfahren-Collections mit
`depth: infinity` ihren Lock an alle Nachfahren.

## Aufgabe
- `packages/core/src/webdav/locking/collect-locks.ts`: Funktion
  `getEffectiveLocks(resource): Promise<EffectiveLock[]>` — liefert
  alle Locks, die für die gegebene Ressource wirksam sind:
  1. Direkter Lock auf der Ressource selbst (falls vorhanden)
  2. Locks von **jeder** Vorfahren-Collection, aber **nur** wenn deren
     `depth = 'infinity'`
  - Abgelaufene Locks (`expiresAt < now`) werden **ignoriert** (lazy
    Expiry — kein Cleanup-Job nötig, ein abgelaufener Lock-Eintrag ist
    einfach wirkungslos; tatsächliches Löschen alter Zeilen ist
    Aufräumarbeit, keine Korrektheits-Voraussetzung)
- `packages/core/src/webdav/locking/check-lock-conflict.ts`: Funktion
  `wouldConflict(existingLocks, requestedScope): boolean` — ein neuer
  `exclusive`-Lock kollidiert mit **jedem** bestehenden wirksamen Lock;
  ein neuer `shared`-Lock kollidiert nur mit einem bestehenden
  `exclusive`-Lock (mehrere `shared`-Locks koexistieren)
- `packages/core/src/webdav/locking/check-lock-token.ts`: Funktion
  `hasValidLockToken(effectiveLocks, ifHeaderTokens): boolean` — prüft,
  ob die im `If`-Header mitgeschickten Tokens **alle** wirksamen Locks
  der Ressource abdecken (nötig für die
  [Lock-Enforcement-Middleware](../05-lock-enforcement-middleware/00-overview.md))

## Akzeptanzkriterien
- [ ] Ein `depth: infinity`-Lock auf einer Collection gilt für eine
      Datei zwei Ebenen darunter (Test mit verschachtelten Collections)
- [ ] Ein `depth: zero`-Lock auf einer Collection gilt **nicht** für
      deren Kinder
- [ ] Ein abgelaufener Lock wird von `getEffectiveLocks` nicht mehr
      zurückgegeben
- [ ] Zwei `shared`-Locks derselben Ressource sind kein Konflikt, ein
      `shared`- und ein `exclusive`-Lock sind ein Konflikt (beide
      Reihenfolgen getestet)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
