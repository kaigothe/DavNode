# Sub-Task: Default-Owner-ACE-Utility

## Kontext
RFC 3744 ist default-deny — ohne passende ACE ist jeder Zugriff
verboten, auch für den Eigentümer (siehe
[00-setting-goal.md](../00-setting-goal.md)). Diese Utility wird von
allen Ressourcen-Erzeugungs-Codepfaden aufgerufen, die in M2 gebaut
wurden.

## Aufgabe
- `packages/core/src/acl/create-owner-ace.ts`: Funktion
  `createOwnerAllAce(resourceType: 'collection' | 'file', resourceId, ownerPrincipalId)`,
  die eine `protected = true`-ACE anlegt: `principalId = ownerPrincipalId`,
  `privilege = 'all'`, `grantDeny = 'grant'`, `position = 0` (immer
  zuerst ausgewertet)
- Diese Funktion in den vier bestehenden M2-Codepfaden aufrufen, die
  Ressourcen erzeugen (jeweils in derselben Transaktion wie die
  Ressourcen-Erzeugung selbst):
  - [M2 Root-Collection-Bootstrap](../../M2-webdav-core/01-webdav-domain-entities/04-root-collection-bootstrap.md)
  - [M2 MKCOL](../../M2-webdav-core/06-resource-crud/01-mkcol.md)
  - [M2 PUT](../../M2-webdav-core/06-resource-crud/03-put.md) (nur bei
    Neuanlage, nicht beim Überschreiben — die Ressource hat dann schon
    eine ACE)
  - [M2 COPY](../../M2-webdav-core/07-copy-move/01-copy.md) (Ziel-Owner
    ist der anfragende Principal, siehe dortige Owner-Regel)
- `protected = true`-ACEs dürfen von der [ACL-HTTP-Methode](../04-acl-http-method/00-overview.md)
  **nicht** entfernt werden (dort zu prüfen, hier nur die Erzeugung)

## Akzeptanzkriterien
- [ ] Nach MKCOL/PUT-Neuanlage/COPY existiert für die neue Ressource
      genau eine `protected = true`-ACE, die dem Owner `all` gewährt
- [ ] Ein Versuch, diese ACE über die ACL-Methode zu entfernen, schlägt
      fehl (Verweis-Test, tatsächliche Durchsetzung ist Teil von
      [ACL-HTTP-Methode](../04-acl-http-method/00-overview.md))
- [ ] PUT beim Überschreiben einer existierenden Datei legt **keine**
      zweite Default-ACE an

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 19 (falls als Entscheidungsrunde protokolliert)
