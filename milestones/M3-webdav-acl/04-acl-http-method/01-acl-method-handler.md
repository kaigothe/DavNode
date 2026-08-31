# Sub-Task: ACL-Method-Handler

## Kontext
RFC 3744 §8.1: der `ACL`-Request-Body enthält die **vollständige**
gewünschte Liste nicht-geschützter, nicht-geerbter ACEs für die
Zielressource — die Methode **ersetzt**, sie hängt nicht an. Nutzt die
[ACL-Evaluation-Engine](../03-acl-evaluation-engine/00-overview.md) (für
die `write-acl`-Berechtigungsprüfung selbst) und die
[ACE-Entities](../01-ace-entities-and-privileges/01-ace-entities.md).

## Aufgabe
- `packages/server/src/http/routes/acl.route.ts`: prüft zunächst per
  `hasPrivilege(req.principal, resource, 'write-acl')`, ob der
  anfragende Principal überhaupt ACEs setzen darf → sonst `403`
- Parst den `<D:acl>`-Request-Body in eine Liste
  `{ principalUrl, grantDeny, privileges[] }` (nutzt den
  [Principal-URL-Parser aus M1](../../M1-kern-datenmodell-tenancy/03-principal-url-schema/01-principal-url-mapping.md),
  um `principalUrl` auf eine tatsächliche `Principal`-Zeile aufzulösen —
  unbekannte/fremde Tenant-Principal-URLs → `403` mit
  `<D:recognized-principal/>`-Fehlerbedingung, RFC3744 §9.2)
- **Atomare Ersetzung** (in einer DB-Transaktion, analog zur
  PROPPATCH-Atomarität aus M2): alle bestehenden **nicht-`protected`**
  direkten ACEs der Ressource werden gelöscht, die neuen ACEs aus dem
  Request werden mit fortlaufender `position` (beginnend nach den
  `protected`-ACEs) neu angelegt
- **Schutz der `protected`-ACEs**: enthält der Request eine ACE, die
  eine bestehende `protected`-ACE widersprüchlich verändern würde
  (gleicher Principal, aber andere Rechte/`grantDeny`), wird der
  **gesamte** Request mit `403 Forbidden` und
  `<D:no-ace-conflict/>`-Fehlerbedingung abgelehnt — nichts wird
  verändert
- **Keine geerbten ACEs im Request erlaubt**: enthält der Request eine
  ACE mit `<D:inherited>`, wird der gesamte Request mit `403` und
  `<D:no-inherit/>` abgelehnt (RFC3744 §9.2)
- Erfolgreich: `200 OK`, keine Response-Body-Pflicht

## Akzeptanzkriterien
- [ ] Nutzer ohne `write-acl` auf der Ressource bekommt `403`, ACEs
      bleiben unverändert
- [ ] Ein gültiger ACL-Request ersetzt die nicht-geschützten ACEs
      vollständig (Test: alte, nicht mehr enthaltene ACE ist danach weg)
- [ ] Ein Request, der versucht, die Default-Owner-ACE zu verändern,
      wird komplett abgelehnt (`403`), **keine** der im selben Request
      enthaltenen anderen ACE-Änderungen wird übernommen (Atomaritäts-
      Test)
- [ ] Ein Request mit unbekannter Principal-URL wird abgelehnt

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 3744
