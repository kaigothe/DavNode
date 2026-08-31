# Sub-Task: Quota-Live-Properties

## Kontext
Registriert sich über den seit M2 etablierten Property-Provider-
Registry-Mechanismus, für **alle** Collection-Typen (WebDAV
`Collection`, `CalendarCollection`, `AddressbookCollection`) einheitlich
— Quota ist eine account-weite Größe, nicht pro Ressourcentyp
verschieden.

## Aufgabe
- `packages/core/src/quota/quota-properties-provider.ts`: registriert
  `DAV:quota-used-bytes` und `DAV:quota-available-bytes` für alle drei
  Collection-Typen
- `quota-used-bytes` = `User.quotaUsedBytes` des jeweiligen
  Ressourcen-**Eigentümers** (nicht des anfragenden Principals, falls
  unterschiedlich — z.B. bei einem Kalender, auf den ein anderer Nutzer
  per ACL Lesezugriff hat)
- `quota-available-bytes` = das **restriktivere** der beiden Limits:
  `min(User.quotaLimitBytes - User.quotaUsedBytes, Tenant.quotaLimitBytes - Tenant.quotaUsedBytes)`
  — ist eines der beiden Limits `NULL` (kein Limit), zählt nur das
  andere; sind **beide** `NULL`, wird laut RFC4331 ein sehr großer
  Platzhalterwert zurückgegeben (kein "unendlich" in der Property
  darstellbar)

## Akzeptanzkriterien
- [ ] PROPFIND auf eine Collection mit gesetztem User-Limit liefert
      korrektes `quota-available-bytes` (Limit minus Nutzung)
- [ ] Ist das Tenant-Limit restriktiver als das User-Limit, wird das
      Tenant-Limit widergespiegelt (Test mit bewusst niedrigerem
      Tenant-Limit)
- [ ] Beide Limits `NULL` liefert einen großen Platzhalterwert, keinen
      Fehler

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4331
