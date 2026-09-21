-- Migration: Kalkulations-Modul
-- Im Supabase Dashboard unter "SQL Editor" ausführen.
--
-- Aufbau: die Kalkulation ist ein Monats-Snapshot. Pro Monat wird
-- festgehalten, welche Ansätze galten, welche Objekte mit welchem Abo
-- liefen und welche Personen zu welchem Lohn beschäftigt waren. Sonst
-- rechnet man alte Monate mit heutigen Sätzen nach -- genau der Fehler,
-- der im bisherigen Excel steckte.
--
-- Die Stammdaten auf objekte/employees dienen als Vorlage: beim Anlegen
-- eines neuen Monats werden sie in die Monatstabellen kopiert und sind
-- dort frei überschreibbar.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- 1. Stammdaten ergänzen
-- ---------------------------------------------------------------
alter table objekte add column if not exists objekt_nr text;
alter table objekte add column if not exists abo_betrag numeric;   -- Standardpreis pro Monat
alter table objekte add column if not exists aktiv boolean not null default true;

alter table employees add column if not exists stundenlohn numeric;
alter table employees add column if not exists monatslohn numeric;

-- ---------------------------------------------------------------
-- 2. Ansätze pro Monat
-- ---------------------------------------------------------------
create table if not exists kalk_monat (
  monat date primary key,                                   -- immer der 1. des Monats
  ahv            numeric not null default 0.053,
  alv            numeric not null default 0.011,
  nbu            numeric not null default 0.0138,
  bu             numeric not null default 0.014494,
  ktg_objekt     numeric not null default 0.00796,
  ktg_personal   numeric not null default 0.00825,
  rpk            numeric not null default 0.002,
  fak            numeric not null default 0.012,
  ml13           numeric not null default 0.0833,
  nbu_schwelle   numeric not null default 8,                -- Std./Woche
  -- Nach Art. 91 UVG trägt die NBU-Prämie der Arbeitnehmer. Nur wenn die
  -- Firma sie freiwillig übernimmt, ist sie eine Arbeitgeberkost.
  nbu_traegt_ag  boolean not null default false,
  bvg_satz       numeric not null default 0.07,
  bvg_eintritt   numeric not null default 22680,
  bvg_koord      numeric not null default 26460,
  bvg_min        numeric not null default 3780,
  bvg_max        numeric not null default 64260,
  mat            numeric not null default 15,               -- CHF pro Objekt
  mas            numeric not null default 15,
  trs            numeric not null default 0,                -- Pauschale pro Objekt
  trs_topf       numeric not null default 0,                -- Treibstoff, wird verteilt
  trs_schluessel text    not null default 'abos'
                 check (trs_schluessel in ('abos','objekt')),
  admin_reserve  numeric not null default 0.10,
  notiz          text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 3. Adminkosten pro Monat
-- ---------------------------------------------------------------
create table if not exists kalk_adminkosten (
  id         uuid primary key default gen_random_uuid(),
  monat      date not null references kalk_monat(monat) on delete cascade,
  position   text not null,
  betrag     numeric not null default 0,
  sortierung int  not null default 0
);
create index if not exists kalk_adminkosten_monat_idx on kalk_adminkosten(monat);

-- ---------------------------------------------------------------
-- 4. Objekte pro Monat
-- ---------------------------------------------------------------
-- std_manuell ist der Rückfallwert, solange im Stundentool für dieses
-- Objekt nichts erfasst ist. Sobald Einträge vorliegen, rechnet die
-- Kalkulation mit den erfassten Stunden und ignoriert das Feld.
create table if not exists kalk_objekt_monat (
  monat       date not null references kalk_monat(monat) on delete cascade,
  objekt_id   uuid not null references objekte(id) on delete restrict,
  abo_betrag  numeric,
  std_manuell numeric,
  lohn_manuell numeric,                                     -- Ansatz, wenn ohne Stundendaten gerechnet wird
  ma          numeric not null default 1,
  aktiv       boolean not null default true,
  primary key (monat, objekt_id)
);

-- ---------------------------------------------------------------
-- 5. Personal pro Monat
-- ---------------------------------------------------------------
-- Nur Festpersonal ohne direkten Objektbezug. Wer über das Stundentool
-- auf Objekte bucht, erscheint hier nicht -- sonst wäre der Lohn doppelt.
create table if not exists kalk_person_monat (
  monat        date not null references kalk_monat(monat) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  lohn         numeric not null default 0,
  spesen       numeric not null default 0,
  ml13         boolean not null default false,
  abzug_ahv    boolean not null default true,
  abzug_alv    boolean not null default true,
  abzug_rpk    boolean not null default true,
  abzug_fak    boolean not null default true,
  fak_manuell  numeric,
  bvg          boolean not null default true,
  bvg_manuell  numeric,
  primary key (monat, employee_id)
);

-- ---------------------------------------------------------------
-- 6. Row Level Security, gleiche Regel wie überall sonst
-- ---------------------------------------------------------------
alter table kalk_monat        enable row level security;
alter table kalk_adminkosten  enable row level security;
alter table kalk_objekt_monat enable row level security;
alter table kalk_person_monat enable row level security;

drop policy if exists "Nur eingeloggte Benutzer: kalk_monat" on kalk_monat;
create policy "Nur eingeloggte Benutzer: kalk_monat" on kalk_monat
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Nur eingeloggte Benutzer: kalk_adminkosten" on kalk_adminkosten;
create policy "Nur eingeloggte Benutzer: kalk_adminkosten" on kalk_adminkosten
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Nur eingeloggte Benutzer: kalk_objekt_monat" on kalk_objekt_monat;
create policy "Nur eingeloggte Benutzer: kalk_objekt_monat" on kalk_objekt_monat
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Nur eingeloggte Benutzer: kalk_person_monat" on kalk_person_monat;
create policy "Nur eingeloggte Benutzer: kalk_person_monat" on kalk_person_monat
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
