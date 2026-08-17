-- DELS Stundentool: Datenbank-Schema
-- Diesen Code im Supabase Dashboard unter "SQL Editor" ausführen.

create extension if not exists "pgcrypto";

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ferienanspruch numeric not null default 25,
  soll_pro_tag numeric not null default 8.4,
  created_at timestamptz not null default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  type text not null check (type in ('arbeit', 'ferien', 'krankheit', 'unfall', 'feiertag', 'sonstiges')),
  value numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists entries_employee_id_idx on entries(employee_id);
create index if not exists entries_date_idx on entries(date);

-- Row Level Security: nur eingeloggte Benutzer (dein Admin-Account) dürfen lesen/schreiben.
-- Ohne Login kommt niemand an die Daten, auch nicht mit der öffentlichen anon-URL.
alter table employees enable row level security;
alter table entries enable row level security;

create policy "Nur eingeloggte Benutzer: employees" on employees
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Nur eingeloggte Benutzer: entries" on entries
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
