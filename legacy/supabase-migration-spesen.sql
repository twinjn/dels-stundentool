-- Migration: Spesen als neuer Eintrags-Typ
-- Im Supabase Dashboard unter "SQL Editor" ausführen.
-- Bei einer neuen Installation reicht supabase-schema.sql, diese Datei ist dann nicht nötig.

alter table entries drop constraint if exists entries_type_check;
alter table entries add constraint entries_type_check
  check (type in ('arbeit', 'ferien', 'krankheit', 'unfall', 'feiertag', 'sonstiges', 'spesen'));
