# Sub-Task: Lock-Live-Properties

## Kontext
Ersetzt die in M2 bewusst leer ausgelieferten Platzhalter-Werte für
`supportedlock`/`lockdiscovery` (siehe
[M2-Property-Provider-Abstraktion](../../M2-webdav-core/03-webdav-xml-property-infrastructure/02-property-provider-abstraction.md),
dort als "Class-1-Konformität ohne echtes Locking" beschrieben).

## Aufgabe
- `packages/core/src/webdav/locking/lock-properties-provider.ts`:
  registriert sich beim Property-Provider-Registry-Mechanismus aus M2
  und überschreibt/ergänzt:
  - `DAV:supportedlock` — jetzt statisch: `write`/`exclusive` **und**
    `write`/`shared` (beide unterstützt, siehe
    [Lock-Erzeugung](../03-lock-method/01-lock-creation.md))
  - `DAV:lockdiscovery` — nutzt `getEffectiveLocks` aus
    [Lock-Evaluation](../02-lock-evaluation/00-overview.md), liefert
    für jeden wirksamen Lock (direkt oder geerbt) einen
    `<D:activelock>`-Block mit `lockscope`, `locktype`, `depth`,
    `owner` (aus `ownerInfo`), `timeout` (aus `expiresAt` berechnet,
    `Second-N` oder `Infinite`), `locktoken`, `lockroot`

## Akzeptanzkriterien
- [ ] PROPFIND auf eine ungesperrte Ressource liefert ein leeres
      `lockdiscovery`-Element (kein Fehler, einfach keine `activelock`-
      Einträge)
- [ ] PROPFIND auf eine direkt gesperrte Ressource liefert einen
      `activelock`-Eintrag mit korrektem `locktoken`
- [ ] PROPFIND auf eine Ressource mit **geerbtem** Lock (Collection mit
      `Depth: infinity`) liefert ebenfalls den korrekten
      `activelock`-Eintrag, mit `lockroot`, das auf die
      Vorfahren-Collection zeigt (nicht auf die abgefragte Ressource
      selbst)
- [ ] `supportedlock` listet beide Kombinationen (`exclusive`/`shared`)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
