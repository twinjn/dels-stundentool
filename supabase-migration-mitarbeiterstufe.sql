-- Migration: Mitarbeiterstufe (GAV-Lohnkategorie) hinzufügen
-- Im Supabase Dashboard unter "SQL Editor" ausführen.
-- Bei einer neuen Installation reicht supabase-schema.sql, diese Datei ist dann nicht nötig.

alter table employees add column if not exists mitarbeiterstufe text;
