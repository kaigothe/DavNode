# Sub-Task: ACE-Sammlung mit Vererbung

## Kontext
ACEs gelten auf der Ressource selbst (direkt) **und** werden von
Vorfahren-Collections vererbt (Entscheidung Runde 12: ACEs sind sowohl
auf Collection- als auch auf Objekt-Ebene möglich). Für die
Rechteprüfung müssen beide Quellen kombiniert werden.

## Aufgabe
- `packages/core/src/acl/collect-aces.ts`: Funktion, die für eine
  gegebene Ressource (Collection oder FileResource) eine geordnete Liste
  aller relevanten ACEs liefert:
  1. **Direkte ACEs** der Ressource selbst, in ihrer gespeicherten
     `position`-Reihenfolge
  2. **Geerbte ACEs**: von der direkten Eltern-Collection, dann deren
     Eltern-Collection, usw. bis zur Root-Collection — jeweils in der
     `position`-Reihenfolge der jeweiligen Collection, nähere Vorfahren
     vor entfernteren
- Jede zurückgegebene ACE wird mit einem `inherited: boolean`-Flag und
  (falls geerbt) der `inheritedFrom`-Collection-ID angereichert (wird
  später für die ACL-PROPFIND-Antwort gebraucht, RFC3744 §5.5 —
  `<D:inherited>`-Element)
- Generisch über den ACE-Typ implementiert (TypeScript-Generics), damit
  M5/M6 dieselbe Funktion mit ihren eigenen ACE-Tabellen nutzen können

## Akzeptanzkriterien
- [ ] Eine Datei in einer Collection ohne eigene ACEs erhält genau die
      ACEs ihrer Eltern-Collection, markiert als `inherited: true`
- [ ] Eine Datei mit eigenen ACEs erhält **beide**: eigene (zuerst,
      `inherited: false`) und geerbte (danach)
- [ ] Vererbung funktioniert über mehrere Collection-Ebenen hinweg
      (Test mit drei verschachtelten Collections)
- [ ] Reihenfolge ist deterministisch und stimmt mit der oben
      beschriebenen Priorität überein (Test prüft die tatsächliche
      Reihenfolge der zurückgegebenen Liste)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 12
