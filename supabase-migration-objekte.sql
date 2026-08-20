-- Migration: Objekte-Modul hinzufügen
-- Im Supabase Dashboard unter "SQL Editor" ausführen (nach der Stammdaten-Migration).
-- Bei einer neuen Installation reicht supabase-schema.sql, diese Datei ist dann nicht nötig.

create table if not exists objekte (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  strasse text,
  plz text,
  ort text,
  kunde text,
  notizen text,
  created_at timestamptz not null default now()
);

alter table entries add column if not exists objekt_id uuid references objekte(id) on delete restrict;

-- Bestehende Arbeits-Einträge ohne Objekt (aus der Zeit vor diesem Modul) einem
-- Platzhalter-Objekt zuordnen, damit die neue Pflichtfeld-Regel unten nicht scheitert.
-- Du kannst das Objekt "Allgemein / Alteinträge" später umbenennen oder die
-- betroffenen Einträge manuell auf das richtige Objekt umstellen.
insert into objekte (name)
select 'Allgemein / Alteinträge'
where not exists (select 1 from objekte where name = 'Allgemein / Alteinträge');

update entries
set objekt_id = (select id from objekte where name = 'Allgemein / Alteinträge')
where type = 'arbeit' and objekt_id is null;

alter table entries drop constraint if exists entries_arbeit_braucht_objekt;
alter table entries add constraint entries_arbeit_braucht_objekt check (type <> 'arbeit' or objekt_id is not null);

create index if not exists entries_objekt_id_idx on entries(objekt_id);

alter table objekte enable row level security;

drop policy if exists "Nur eingeloggte Benutzer: objekte" on objekte;
create policy "Nur eingeloggte Benutzer: objekte" on objekte
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
