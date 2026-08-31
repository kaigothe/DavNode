# Sub-Task: Sync-Token-Format & Validierung

## Kontext
RFC 6578 lässt das konkrete Sync-Token-Format offen (für den Client
undurchsichtig) — DavNode kodiert Collection-Bezug und Sequenznummer
direkt hinein, statt eine separate Lookup-Tabelle zu brauchen.

## Aufgabe
- `packages/core/src/webdav/sync/sync-token.ts`: Funktionen
  `encodeSyncToken(collectionId, seq): string` (Format z.B.
  `"davnode-sync:{collectionId}:{seq}"`) und
  `decodeSyncToken(token: string): { collectionId: string; seq: number } | null`
  (liefert `null` bei nicht parsbarem Format, statt zu werfen)
- **Initiale Synchronisation**: fehlendes oder leeres `<D:sync-token>`
  im Request entspricht `seq = 0` (der Client hat noch nie
  synchronisiert, bekommt also **alle** aktuell existierenden Kinder als
  "hinzugefügt" gemeldet)
- **Validierung** (`packages/core/src/webdav/sync/validate-sync-token.ts`):
  ein Token ist ungültig, wenn (a) das Format nicht passt, (b) die
  `collectionId` nicht zur angefragten Collection passt (Client hat den
  Token einer anderen Collection mitgeschickt), oder (c) `seq` größer
  ist als der aktuelle `syncSeq` der Collection (kann durch DB-Restore
  o.ä. passieren) — in allen drei Fällen: `403 Forbidden` mit
  `<D:valid-sync-token/>`-Fehlerbedingung (RFC6578 §3.6)

## Akzeptanzkriterien
- [ ] Roundtrip `decodeSyncToken(encodeSyncToken(id, seq))` liefert
      `{collectionId: id, seq}`
- [ ] Leeres/fehlendes Sync-Token wird als `seq = 0` behandelt, keine
      Ablehnung
- [ ] Token einer anderen Collection wird abgelehnt (`403`)
- [ ] Token mit `seq` größer als der aktuelle Collection-`syncSeq` wird
      abgelehnt (`403`)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6578 §3.6
