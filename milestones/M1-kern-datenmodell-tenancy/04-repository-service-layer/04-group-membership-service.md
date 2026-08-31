# Sub-Task: GroupMembershipService

## Kontext
Gruppen können andere Gruppen als Mitglied haben (verschachtelte
Gruppen, siehe
[Group- & GroupMembership-Entity](../01-core-entities/04-group-and-membership-entity.md)).
Das eröffnet die Möglichkeit von **Zyklen** (Gruppe A enthält B, B
enthält A) — unentdeckt würde das die spätere ACL-Auswertung (RFC 3744,
M3) bei der Auflösung "ist Principal X Mitglied von Gruppe Y" in eine
Endlosschleife laufen lassen. Das ist der wichtigste Punkt dieser
Aufgabe.

## Aufgabe
- `packages/core/src/services/group-membership.service.ts` mit:
  - `addMember(groupId, memberPrincipalId): Promise<void>` — prüft
    **vor** dem Insert per Graph-Traversierung, ob das Hinzufügen einen
    Zyklus erzeugen würde (d.h. ob `groupId` bereits transitiv Mitglied
    von `memberPrincipalId` ist, falls `memberPrincipalId` selbst eine
    Gruppe ist); wirft einen klaren Fehler statt den Zyklus anzulegen
  - `removeMember(groupId, memberPrincipalId): Promise<void>`
  - `resolveEffectiveMembers(groupId): Promise<Principal[]>` — liefert
    alle Mitglieder **transitiv aufgelöst** (verschachtelte Gruppen
    vollständig expandiert, keine Duplikate auch bei Diamant-
    Mitgliedschaften, terminiert garantiert auch bei (fälschlich)
    vorhandenen Zyklen durch einen Visited-Set)
- Tests: direkter Zyklus (A→B, B→A) wird abgelehnt; indirekter Zyklus
  (A→B→C→A) wird abgelehnt; `resolveEffectiveMembers` liefert bei
  verschachtelten, nicht-zyklischen Gruppen die korrekte, deduplizierte
  Mitgliederliste

## Akzeptanzkriterien
- [ ] Direkter und indirekter Zyklus werden beide von `addMember`
      abgelehnt (zwei getrennte Tests)
- [ ] `resolveEffectiveMembers` terminiert auch dann, wenn (z.B. durch
      einen Bug anderswo) doch ein Zyklus in der DB existiert
      (Visited-Set-Schutz, mit Test)
- [ ] `resolveEffectiveMembers` dedupliziert korrekt bei
      Diamant-Mitgliedschaften (User ist über zwei verschiedene
      Zwischengruppen Mitglied derselben Ziel-Gruppe)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 5
