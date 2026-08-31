# Sub-Task: Mitgliedschafts-Endpunkte

## Kontext
Nutzt
[GroupMembershipService aus M1](../../../M1-kern-datenmodell-tenancy/04-repository-service-layer/04-group-membership-service.md) —
Zyklen-Erkennung und transitive Auflösung sind dort bereits vollständig
implementiert, hier nur REST-Exposition.

## Aufgabe
- `POST /admin/{tenantSlug}/groups/{groupId}/members` —
  `{ "principalId": "..." }`, ruft `GroupMembershipService.addMember`
  auf; ein durch das Hinzufügen entstehender Zyklus wird von M1s
  Service bereits abgelehnt — hier nur der Fehler als `409` mit
  sprechender Meldung durchreichen
- `DELETE /admin/{tenantSlug}/groups/{groupId}/members/{principalId}` —
  ruft `removeMember` auf
- `GET /admin/{tenantSlug}/groups/{groupId}/members` — direkte
  Mitglieder (nicht transitiv aufgelöst)
- `GET /admin/{tenantSlug}/groups/{groupId}/members/effective` —
  nutzt `resolveEffectiveMembers` (M1), liefert die vollständig
  aufgelöste, deduplizierte Mitgliederliste inkl. verschachtelter
  Gruppen — nützlich, um vor dem Vergeben eines ACE-Grants zu prüfen,
  wer tatsächlich betroffen wäre

## Akzeptanzkriterien
- [ ] Hinzufügen/Entfernen von Mitgliedern funktioniert für User- und
      Gruppen-Principals (verschachtelte Gruppen)
- [ ] Ein Versuch, einen Zyklus zu erzeugen, liefert `409` mit
      sprechender Fehlermeldung (Cross-Check mit M1-Verhalten)
- [ ] `/members/effective` liefert bei einer dreistufig verschachtelten
      Gruppenstruktur die korrekte, deduplizierte Gesamtliste

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 5
