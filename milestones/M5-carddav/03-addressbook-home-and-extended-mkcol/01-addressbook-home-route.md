# Sub-Task: Addressbook-Home-Route

## Kontext
Virtuelle Collection, nicht in der DB abgebildet — analog zur
Principals-Collection aus M3
([M3-Principals-Collection-Route](../../M3-webdav-acl/06-principals-and-report-infrastructure/01-principals-collection-route.md)).

## Aufgabe
- `packages/server/src/http/routes/addressbook-home.route.ts`:
  beantwortet PROPFIND auf `/dav/{tenant}/addressbooks/{userId}/` mit
  allen `AddressbookCollection`-Zeilen, deren `ownerPrincipalId` dem
  Principal des `{userId}` entspricht (Depth 0/1 wie üblich)
- Zugriff: nur der Nutzer selbst (oder ein Principal mit `read` auf
  jedes einzelne Adressbuch via ACL) sieht den Inhalt der eigenen
  Home-Collection — `{userId}` muss zum anfragenden Principal passen,
  sonst `403` (bewusst einfache Regel, keine fremden Home-Collections
  einsehbar, unabhängig von einzelnen Adressbuch-ACEs)
- `CARD:addressbook-home-set` auf dem User-Principal (registriert über
  den in M3 vorbereiteten Property-Provider-Mechanismus, siehe
  [M3-Retrofit-Hinweis](../../M3-webdav-acl/06-principals-and-report-infrastructure/01-principals-collection-route.md))
  liefert die URL dieser Home-Collection

## Akzeptanzkriterien
- [ ] PROPFIND auf die eigene Home-Collection listet alle eigenen
      Adressbücher
- [ ] PROPFIND auf die Home-Collection eines **anderen** Nutzers liefert
      `403`
- [ ] `CARD:addressbook-home-set` auf dem eigenen User-Principal zeigt
      auf die korrekte URL

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6352 §7.1.1
