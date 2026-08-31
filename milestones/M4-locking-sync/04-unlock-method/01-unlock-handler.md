# Sub-Task: UNLOCK-Handler

## Kontext
RFC 4918 §9.11. Der Lock-Token kommt hier **nicht** im `If`-Header,
sondern im dedizierten `Lock-Token`-Header (Sonderfall der
UNLOCK-Methode).

## Aufgabe
- `packages/server/src/http/routes/unlock.route.ts`: liest den
  `Lock-Token`-Header, sucht den zugehörigen Lock (`collection_locks`
  oder `file_locks`) für die Zielressource
- Kein passender Lock gefunden → `409 Conflict` mit
  `<D:lock-token-matches-request-uri/>`-Fehlerbedingung
- Anfragender Principal ist nicht der Lock-Inhaber → `403 Forbidden`
- Bei Erfolg: Lock-Zeile wird gelöscht, Antwort `204 No Content`
- **Wichtig**: UNLOCK auf eine Ressource, die einen Lock nur **geerbt**
  hat (z.B. eine Datei unter einer mit `Depth: infinity` gesperrten
  Collection), muss den Lock-Token aus dem `Lock-Token`-Header trotzdem
  korrekt auf den Lock der **Vorfahren-Collection** auflösen (nutzt
  [getEffectiveLocks](../02-lock-evaluation/01-collect-locks-and-conflict-check.md)),
  nicht nur direkte Locks auf der Zielressource selbst

## Akzeptanzkriterien
- [ ] UNLOCK mit gültigem Token durch den Lock-Inhaber entfernt den Lock
      (nachfolgendes LOCK auf dieselbe Ressource ist wieder möglich)
- [ ] UNLOCK durch einen anderen Principal als den Inhaber liefert `403`
- [ ] UNLOCK mit unbekanntem/falschem Token liefert `409`
- [ ] UNLOCK einer Datei mit einem geerbten Collection-Lock-Token
      funktioniert (Test mit `Depth: infinity`-Lock auf der
      Eltern-Collection)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918 §9.11
