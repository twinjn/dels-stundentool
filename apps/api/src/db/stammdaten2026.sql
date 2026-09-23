-- Objektstammdaten und Kalkulationsmonat Februar 2026.
--
-- Herkunft: Kalkulationstabelle_DELS.xlsx und Kostenuebersicht.xlsx, beim
-- Aufbau des Altsystems einmal von Hand uebernommen und damals gegen das
-- Excel geprueft. Diese Fassung ist dieselbe Datenlage, nur fuer die neue
-- Datenbank umgeschrieben.
--
-- WAS ANDERS IST ALS IN legacy/supabase-import-kalkulation-februar.sql:
-- Dort wurden Objekte am NAMEN gesucht. Nach dem Excel-Import heissen sie
-- aber "Objekt 10002", weil in den Stundendateien kein Name steht. Hier
-- wird deshalb ueber die OBJEKTNUMMER zugeordnet, die der Import setzt.
--
-- VORSICHTIG GESCHRIEBEN, mehrfach ausfuehrbar:
--   - Der Name wird nur ersetzt, solange er noch der Platzhalter ist.
--     Wer eigene Namen eingetippt hat, behaelt sie.
--   - Adresse, Kunde und Abo werden nur gesetzt, wo bisher nichts steht.
--   - Der Kalkulationsmonat wird nur angelegt, wenn es ihn nicht gibt.
--
-- Aufruf:  npm run db:stammdaten


-- 1. Objekte ohne Nummer, die es sonst nirgends gibt
insert into objekte (name, strasse, plz, ort, kunde)
  select 'Jugendarbeit Steinackerstrasse', 'Steinackerstrasse 19', '8302', 'Kloten', 'Stadt Kloten Liegenschaften'
  where not exists (select 1 from objekte where name = 'Jugendarbeit Steinackerstrasse');
insert into objekte (name, strasse, plz, ort, kunde)
  select 'MFW Blumenfeldstrasse', 'Blumenfeldstr. 10', '8048', 'Zürich', 'Ruben Kretschmar & Angelika Hilbeck'
  where not exists (select 1 from objekte where name = 'MFW Blumenfeldstrasse');

-- 2. Stammdaten an die Objektnummer haengen
update objekte set
    name        = case when name = 'Objekt 10008' then 'AIL Swiss-Austria Leasing AG' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 350)
  where objekt_nr = '10008';
update objekte set
    name        = case when name = 'Objekt 10004' then 'Apotheke Drogerie Brunaupark' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1130)
  where objekt_nr = '10004';
update objekte set
    name        = case when name = 'Objekt 10006' then 'Bäckerei-Konditorei Reppischtalstrasse' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1750)
  where objekt_nr = '10006';
update objekte set
    name        = case when name = 'Objekt 10007' then 'Bäckerei-Konditorei Zürcherstrasse' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 615)
  where objekt_nr = '10007';
update objekte set
    name        = case when name = 'Objekt 10040' then 'Baloise Versicherung AG' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 650)
  where objekt_nr = '10040';
update objekte set
    name        = case when name = 'Objekt 10009' then 'Baulink AG' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1222)
  where objekt_nr = '10009';
update objekte set
    name        = case when name = 'Objekt 10013' then 'Büro 2. OG Gerbegasse' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 320)
  where objekt_nr = '10013';
update objekte set
    name        = case when name = 'Objekt 10025' then 'Dreifach Kindergarten Geissberg' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1560)
  where objekt_nr = '10025';
update objekte set
    name        = case when name = 'Objekt 10016' then 'Frauenpraxis Uster West' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1670)
  where objekt_nr = '10016';
update objekte set
    name        = case when name = 'Objekt 10024' then 'Friedhof Chloos' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 390)
  where objekt_nr = '10024';
update objekte set
    name        = case when name = 'Objekt 10019' then 'Hong Kong Oerlikon Vertex' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 530)
  where objekt_nr = '10019';
update objekte set
    name        = case when name = 'Objekt 10020' then 'Hong Kong Sihlcity' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 250)
  where objekt_nr = '10020';
update objekte set
    name        = case when name = 'Objekt 10028' then 'IDEOGEN AG' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1505)
  where objekt_nr = '10028';
update objekte set
    name        = case when name = 'Objekt 10003' then 'KIGA Hochrainli' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1350)
  where objekt_nr = '10003';
update objekte set
    name        = case when name = 'Objekt 10036' then 'LS Erlachstrasse' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 735)
  where objekt_nr = '10036';
update objekte set
    name        = case when name = 'Objekt 10037' then 'LS Karstlenstrasse' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 575.5)
  where objekt_nr = '10037';
update objekte set
    name        = case when name = 'Objekt 10034' then 'LS Nord/Zschokkestrasse' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1890)
  where objekt_nr = '10034';
update objekte set
    name        = case when name = 'Objekt 10035' then 'LS Probusweg' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 346)
  where objekt_nr = '10035';
update objekte set
    name        = case when name = 'Objekt 10011' then 'LS Schaffhauserstrasse 104' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1365)
  where objekt_nr = '10011';
update objekte set
    name        = case when name = 'Objekt 10041' then 'LS Schaffhauserstrasse 92' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 420)
  where objekt_nr = '10041';
update objekte set
    name        = case when name = 'Objekt 10032' then 'LS Schaffhauserstrasse 94' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 420)
  where objekt_nr = '10032';
update objekte set
    name        = case when name = 'Objekt 10029' then 'LS Schürbunertweg' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 819)
  where objekt_nr = '10029';
update objekte set
    name        = case when name = 'Objekt 10012' then 'LS Steinackerstrasse' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 1732.5)
  where objekt_nr = '10012';
update objekte set
    name        = case when name = 'Objekt 10042' then 'LS STWG Bahnhofstrasse' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 450)
  where objekt_nr = '10042';
update objekte set
    name        = case when name = 'Objekt 10021' then 'Milliman AG' else name end,
    strasse     = coalesce(strasse, null),
    plz         = coalesce(plz,     null),
    ort         = coalesce(ort,     null),
    kunde       = coalesce(kunde,   null),
    abo_betrag  = coalesce(abo_betrag, 325)
  where objekt_nr = '10021';
update objekte set
    name        = case when name = 'Objekt 10023' then 'Apartment + Aufenthaltsraum Chäsernweg' else name end,
    strasse     = coalesce(strasse, 'Chäsernweg 22, 24'),
    plz         = coalesce(plz,     '8302'),
    ort         = coalesce(ort,     'Kloten'),
    kunde       = coalesce(kunde,   'Stadt Kloten Liegenschaften'),
    abo_betrag  = coalesce(abo_betrag, null)
  where objekt_nr = '10023';
update objekte set
    name        = case when name = 'Objekt 10002' then 'Burgring ZüriOberland Geschäftshaus' else name end,
    strasse     = coalesce(strasse, 'Bahnhofstr. 63'),
    plz         = coalesce(plz,     '8620'),
    ort         = coalesce(ort,     'Wetzikon'),
    kunde       = coalesce(kunde,   'Burgring ZüriOberland AG'),
    abo_betrag  = coalesce(abo_betrag, null)
  where objekt_nr = '10002';
update objekte set
    name        = case when name = 'Objekt 10014' then 'LS Hofackerstrasse' else name end,
    strasse     = coalesce(strasse, 'Hofackerstr. 44'),
    plz         = coalesce(plz,     '8032'),
    ort         = coalesce(ort,     'Zürich'),
    kunde       = coalesce(kunde,   'Burgring ZüriOberland AG'),
    abo_betrag  = coalesce(abo_betrag, null)
  where objekt_nr = '10014';
update objekte set
    name        = case when name = 'Objekt 10010' then 'Spital Limmattal Regensdorf' else name end,
    strasse     = coalesce(strasse, 'Riedthostrasse 1'),
    plz         = coalesce(plz,     '8105'),
    ort         = coalesce(ort,     'Regensdorf'),
    kunde       = coalesce(kunde,   'Spital Limmattal'),
    abo_betrag  = coalesce(abo_betrag, null)
  where objekt_nr = '10010';
update objekte set
    name        = case when name = 'Objekt 10031' then 'Audika AG' else name end,
    strasse     = coalesce(strasse, 'Steinackerstrasse 35'),
    plz         = coalesce(plz,     '8906'),
    ort         = coalesce(ort,     'Urdorf'),
    kunde       = coalesce(kunde,   'Audika AG'),
    abo_betrag  = coalesce(abo_betrag, null)
  where objekt_nr = '10031';
update objekte set
    name        = case when name = 'Objekt 10005' then 'Bäckerei-Konditorei Birmensdorf' else name end,
    strasse     = coalesce(strasse, 'Zürcherstrasse 11'),
    plz         = coalesce(plz,     '8903'),
    ort         = coalesce(ort,     'Birmensdorf'),
    kunde       = coalesce(kunde,   'Bäckerei-Konditorei Bode'),
    abo_betrag  = coalesce(abo_betrag, null)
  where objekt_nr = '10005';

-- 3. Ansaetze des Monats Februar 2026
insert into kalk_monat (monat, ahv, alv, nbu, bu, ktg_objekt, ktg_personal, rpk, fak, ml13, nbu_schwelle, nbu_traegt_ag, bvg_satz, bvg_eintritt, bvg_koord, bvg_min, bvg_max, mat, mas, trs, trs_topf, trs_schluessel, admin_reserve, notiz)
  values ('2026-02-01', 0.053, 0.011, 0.0138, 0.014494, 0.00796, 0.00825, 0.002, 0.012, 0.0833, 8, false, 0.07, 22680, 26460, 3780, 64260, 15, 15, 0, 1400, 'abos', 0.10, 'Aus Kalkulationstabelle_DELS.xlsx übernommen und gegen das Excel geprüft. Treibstoff steht im trs_topf statt in den Adminkosten, die Trs-Pauschale ist deshalb 0. NBU trägt laut Art. 91 UVG der Arbeitnehmer, daher nbu_traegt_ag = false.')
  on conflict (monat) do nothing;

-- 4. Adminkosten Februar (Kostenuebersicht.xlsx, ohne Treibstoff)
delete from kalk_adminkosten where monat = '2026-02-01';
insert into kalk_adminkosten (monat, position, betrag, sortierung) values
  ('2026-02-01', 'Miete', 1650, 0),
  ('2026-02-01', 'Lager', 500, 1),
  ('2026-02-01', 'Nebenkosten', 55, 2),
  ('2026-02-01', 'Treuhand', 1300, 3),
  ('2026-02-01', 'Krankentaggeld', 325, 4),
  ('2026-02-01', 'Geschäftsversicherung', 150, 5),
  ('2026-02-01', 'Haftpflicht', 320, 6),
  ('2026-02-01', 'Autoversicherung', 1125, 7),
  ('2026-02-01', 'Kontrollschild', 400, 8),
  ('2026-02-01', 'Rechtsschutz', 75, 9),
  ('2026-02-01', 'Parkplatz', 420, 10),
  ('2026-02-01', 'Fahrzeuge', 2000, 11),
  ('2026-02-01', 'IT', 300, 12),
  ('2026-02-01', 'Abonnement', 70, 13),
  ('2026-02-01', 'Cashctrl', 70, 14),
  ('2026-02-01', 'Telefon', 490, 15),
  ('2026-02-01', 'Webseite', 20, 16),
  ('2026-02-01', 'Marketing', 100, 17),
  ('2026-02-01', 'Serafe', 50, 18),
  ('2026-02-01', 'Bankspesen', 20, 19),
  ('2026-02-01', 'Verband', 230, 20),
  ('2026-02-01', 'PK', 200, 21),
  ('2026-02-01', 'FCZ', 185, 22),
  ('2026-02-01', 'Rekrutierung, Schulung, Kleidung', 100, 23);

-- 5. Objektzeilen des Monats Februar
delete from kalk_objekt_monat where monat = '2026-02-01';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1670, 33.25, 32.5, 1, true from objekte where name = 'Frauenpraxis Uster West';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 390, 4, 25.46, 1, true from objekte where name = 'Friedhof Chloos';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1090, 8, 26, 1, true from objekte where name = 'Apartment + Aufenthaltsraum Chäsernweg';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1560, 24, 25.46, 1, true from objekte where name = 'Dreifach Kindergarten Geissberg';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, null, null, null, 1, false from objekte where name = 'Jugendarbeit Steinackerstrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1350, 15, 25.46, 1, true from objekte where name = 'KIGA Hochrainli';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1732.5, 6, 25.73, 2, true from objekte where name = 'LS Steinackerstrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1130, 24, 26, 2, true from objekte where name = 'Apotheke Drogerie Brunaupark';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 325, 6, 26, 1, true from objekte where name = 'Milliman AG';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1365, 12, 26, 1, true from objekte where name = 'LS Schaffhauserstrasse 104';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 420, 4, 26, 1, true from objekte where name = 'LS Schaffhauserstrasse 92';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 420, 4, 26, 1, true from objekte where name = 'LS Schaffhauserstrasse 94';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 819, 4, 26, 1, true from objekte where name = 'LS Schürbunertweg';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 575.5, 4, 26, 1, true from objekte where name = 'LS Karstlenstrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 735, 5, 26, 1, true from objekte where name = 'LS Erlachstrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1890, 20, 25.46, 1, true from objekte where name = 'LS Nord/Zschokkestrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 346, 4, 26, 1, true from objekte where name = 'LS Probusweg';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, null, 0, 25.46, 1, true from objekte where name = 'FC Othmarsingen';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 445, 6, 25.46, 1, true from objekte where name = 'Burgring ZüriOberland Geschäftshaus';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 640, 6, 26, 1, true from objekte where name = 'LS Hofackerstrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1505, 23, 25.46, 1, true from objekte where name = 'IDEOGEN AG';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 650, 11, 25.46, 1, true from objekte where name = 'Baloise Versicherung AG';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 450, 6, 25.46, 1, true from objekte where name = 'LS STWG Bahnhofstrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 350, 4, 26, 1, true from objekte where name = 'AIL Swiss-Austria Leasing AG';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1222, 15.75, 26, 1, true from objekte where name = 'Baulink AG';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 500, 0, 25.46, 1, true from objekte where name = 'MFW Blumenfeldstrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 510.7, 8, 25.46, 1, true from objekte where name = 'Spital Limmattal Regensdorf';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 320, 4, 26, 1, true from objekte where name = 'Büro 2. OG Gerbegasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 530, null, 25.46, 1, true from objekte where name = 'Hong Kong Oerlikon Vertex';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 250, null, 25.46, 1, true from objekte where name = 'Hong Kong Sihlcity';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, null, null, null, 1, true from objekte where name = 'Audika AG';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 615, 14, 25.46, 1, true from objekte where name = 'Bäckerei-Konditorei Zürcherstrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1750, 40, 25.46, 1, true from objekte where name = 'Bäckerei-Konditorei Reppischtalstrasse';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 2100, 48, 25.46, 1, true from objekte where name = 'Bäckerei-Konditorei Birmensdorf';
