# Sub-Task: Password-Hashing-Utility

## Kontext
Wird sowohl für die Basic-Auth-Verifikation (dieser Große Aufgabe) als
auch später für das Seed-/Bootstrap-Tooling und die Admin-API (M9)
gebraucht — daher als eigenständiges, wiederverwendbares Utility in
`core` bauen, nicht in den Basic-Auth-Provider verschachteln.

## Aufgabe
- `packages/core/src/auth/password-hashing.ts` mit zwei Funktionen:
  `hashPassword(plaintext: string): Promise<string>` und
  `verifyPassword(plaintext: string, hash: string): Promise<boolean>`
- Algorithmus: **argon2id** (aktuelle OWASP-Empfehlung für neue Projekte,
  Node-Package `argon2`) — nicht bcrypt, da argon2id sowohl gegen
  GPU- als auch Seitenkanal-Angriffe robuster ist und keine
  Legacy-Kompatibilitätsgründe für bcrypt vorliegen
- Sinnvolle Default-Parameter (Speicher-/Zeit-Kosten) als benannte
  Konstanten, nicht magische Zahlen inline
- Vitest-Tests: Hash+Verify-Roundtrip erfolgreich, falsches Passwort wird
  abgelehnt, zwei Hashes desselben Passworts sind unterschiedlich (Salt
  wird genutzt)

## Akzeptanzkriterien
- [ ] `verifyPassword` gibt `true` nur für das korrekte Klartext-Passwort
      zurück
- [ ] Zwei Aufrufe von `hashPassword` mit demselben Input erzeugen
      unterschiedliche Hash-Strings (Salting funktioniert)
- [ ] Keine Klartext-Passwörter oder Hashes in Log-Ausgaben

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
