-- Migration: Mitarbeiter-Stammdaten hinzufügen
-- Im Supabase Dashboard unter "SQL Editor" ausführen, wenn die Tabelle
-- "employees" bereits existiert (z.B. bei einer bestehenden Installation).
-- Bei einer neuen Installation reicht supabase-schema.sql, diese Datei
-- ist dann nicht nötig.

alter table employees add column if not exists personalnummer text;
alter table employees add column if not exists geburtsdatum date;
alter table employees add column if not exists eintrittsdatum date;
alter table employees add column if not exists telefon text;
alter table employees add column if not exists email text;
alter table employees add column if not exists strasse text;
alter table employees add column if not exists plz text;
alter table employees add column if not exists ort text;
alter table employees add column if not exists ahv_nummer text;
alter table employees add column if not exists iban text;
