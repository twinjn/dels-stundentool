-- DELS Stundentool: Datenbank-Schema
-- Diesen Code im Supabase Dashboard unter "SQL Editor" ausführen.

create extension if not exists "pgcrypto";

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ferienanspruch numeric not null default 25,
  soll_pro_tag numeric not null default 8.4,
  mitarbeiterstufe text,
  personalnummer text,
  geburtsdatum date,
  eintrittsdatum date,
  telefon text,
  email text,
  strasse text,
  plz text,
  ort text,
  ahv_nummer text,
  iban text,
  created_at timestamptz not null default now()
);

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

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  objekt_id uuid references objekte(id) on delete restrict,
  date date not null,
  type text not null check (type in ('arbeit', 'ferien', 'krankheit', 'unfall', 'feiertag', 'sonstiges', 'spesen')),
  value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  constraint entries_arbeit_braucht_objekt check (type <> 'arbeit' or objekt_id is not null)
);

create index if not exists entries_employee_id_idx on entries(employee_id);
create index if not exists entries_date_idx on entries(date);
create index if not exists entries_objekt_id_idx on entries(objekt_id);

-- Row Level Security: nur eingeloggte Benutzer (dein Admin-Account) dürfen lesen/schreiben.
-- Ohne Login kommt niemand an die Daten, auch nicht mit der öffentlichen anon-URL.
alter table employees enable row level security;
alter table objekte enable row level security;
alter table entries enable row level security;

create policy "Nur eingeloggte Benutzer: employees" on employees
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Nur eingeloggte Benutzer: objekte" on objekte
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Nur eingeloggte Benutzer: entries" on entries
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
