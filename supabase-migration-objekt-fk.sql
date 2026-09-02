-- Migration: Fremdschlüssel entries.objekt_id auf RESTRICT korrigieren
-- Im Supabase Dashboard unter "SQL Editor" ausführen.
--
-- Warum:
-- In der Datenbank steht der Fremdschlüssel auf ON DELETE SET NULL, das
-- Schema-File sagt aber ON DELETE RESTRICT. Vermutlich stammt die Abweichung
-- aus einer frühen Fassung der Objekte-Migration.
--
-- SET NULL ist hier falsch:
--   * Für 'arbeit'-Einträge greift zwar der Check entries_arbeit_braucht_objekt
--     und verhindert das Löschen. Die App fängt diesen Fehler sauber ab, es ist
--     also nichts kaputt -- aber der Abbruch kommt über den Umweg einer
--     verletzten Check-Regel statt direkt über den Fremdschlüssel.
--   * Für alle anderen Typen (z.B. 'spesen') greift der Check nicht. Löscht man
--     ein Objekt, verlieren solche Einträge still ihren Objektbezug. Für die
--     Kalkulation ist das schlecht: Kosten ohne Objekt lassen sich nicht mehr
--     zuordnen und verschwinden aus der Deckungsbeitragsrechnung.
--
-- Mit RESTRICT bricht das Löschen in beiden Fällen direkt und aus demselben
-- Grund ab. Die Meldung in der App bleibt unverändert richtig.
--
-- Rückgängig machen liesse sich das mit derselben Anweisung und
-- "on delete set null" statt "on delete restrict".

alter table entries drop constraint if exists entries_objekt_id_fkey;

alter table entries add constraint entries_objekt_id_fkey
  foreign key (objekt_id) references objekte(id) on delete restrict;
