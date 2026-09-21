-- Daten: Objektstammdaten und Kalkulationsmonat Februar 2026
-- Erzeugt aus der geprueften Excel-Kalkulation. Idempotent, mehrfach ausfuehrbar.

-- ---------------------------------------------------------------
-- 1. Fehlende Objekte anlegen
-- ---------------------------------------------------------------
insert into objekte (name, strasse, plz, ort, kunde, objekt_nr)
  select 'Apartment + Aufenthaltsraum Chaesernweg', 'Chäsernweg 22, 24', '8302', 'Kloten', 'Stadt Kloten Liegenschaften', '10023'
  where not exists (select 1 from objekte where name = 'Apartment + Aufenthaltsraum Chaesernweg');
insert into objekte (name, strasse, plz, ort, kunde, objekt_nr)
  select 'Jugendarbeit Steinackerstrasse', 'Steinackerstrasse 19', '8302', 'Kloten', 'Stadt Kloten Liegenschaften', null
  where not exists (select 1 from objekte where name = 'Jugendarbeit Steinackerstrasse');
insert into objekte (name, strasse, plz, ort, kunde, objekt_nr)
  select 'Burgring ZueriOberland Geschaeftshaus', 'Bahnhofstr. 63', '8620', 'Wetzikon', 'Burgring ZüriOberland AG', '10002'
  where not exists (select 1 from objekte where name = 'Burgring ZueriOberland Geschaeftshaus');
insert into objekte (name, strasse, plz, ort, kunde, objekt_nr)
  select 'LS Hofackerstrasse', 'Hofackerstr. 44', '8032', 'Zürich', 'Burgring ZüriOberland AG', '10014'
  where not exists (select 1 from objekte where name = 'LS Hofackerstrasse');
insert into objekte (name, strasse, plz, ort, kunde, objekt_nr)
  select 'MFW Blumenfeldstrasse', 'Blumenfeldstr. 10', '8048', 'Zürich', 'Ruben Kretschmar & Angelika Hilbeck', null
  where not exists (select 1 from objekte where name = 'MFW Blumenfeldstrasse');
insert into objekte (name, strasse, plz, ort, kunde, objekt_nr)
  select 'Spital Limmattal Regensdorf', 'Riedthostrasse 1', '8105', 'Regensdorf', 'Spital Limmattal', '10010'
  where not exists (select 1 from objekte where name = 'Spital Limmattal Regensdorf');
insert into objekte (name, strasse, plz, ort, kunde, objekt_nr)
  select 'Audika AG', 'Steinackerstrasse 35', '8906', 'Urdorf', 'Audika AG', '10031'
  where not exists (select 1 from objekte where name = 'Audika AG');
insert into objekte (name, strasse, plz, ort, kunde, objekt_nr)
  select 'Baeckerei-Konditorei Birmensdorf', 'Zürcherstrasse 11', '8903', 'Birmensdorf', 'Bäckerei-Konditorei Bode', '10005'
  where not exists (select 1 from objekte where name = 'Baeckerei-Konditorei Birmensdorf');

-- ---------------------------------------------------------------
-- 2. Objektnummer und Standard-Abopreis auf den Stammdaten
-- ---------------------------------------------------------------
update objekte set objekt_nr = '10008', abo_betrag = 350 where name = 'AIL Swiss-Austria Leasing AG';
update objekte set objekt_nr = '10004', abo_betrag = 1130 where name = 'Apotheke Drogerie Brunaupark';
update objekte set objekt_nr = '10006', abo_betrag = 1750 where name = 'Bäckerei-Konditorei Reppischtalstrasse';
update objekte set objekt_nr = '10007', abo_betrag = 615 where name = 'Bäckerei-Konditorei Zürcherstrasse';
update objekte set objekt_nr = '10040', abo_betrag = 650 where name = 'Baloise Versicherung AG';
update objekte set objekt_nr = '10009', abo_betrag = 1222 where name = 'Baulink AG';
update objekte set objekt_nr = '10013', abo_betrag = 320 where name = 'Büro 2. OG Gerbegasse';
update objekte set objekt_nr = '10025', abo_betrag = 1560 where name = 'Dreifach Kindergarten Geissberg';
update objekte set objekt_nr = '10015', abo_betrag = null where name = 'FC Othmarsingen';
update objekte set objekt_nr = '10016', abo_betrag = 1670 where name = 'Frauenpraxis Uster West';
update objekte set objekt_nr = '10024', abo_betrag = 390 where name = 'Friedhof Chloos';
update objekte set objekt_nr = '10019', abo_betrag = 530 where name = 'Hong Kong Oerlikon Vertex';
update objekte set objekt_nr = '10020', abo_betrag = 250 where name = 'Hong Kong Sihlcity';
update objekte set objekt_nr = '10028', abo_betrag = 1505 where name = 'IDEOGEN AG';
update objekte set objekt_nr = '10003', abo_betrag = 1350 where name = 'KIGA Hochrainli';
update objekte set objekt_nr = '10036', abo_betrag = 735 where name = 'LS Erlachstrasse';
update objekte set objekt_nr = '10037', abo_betrag = 575.5 where name = 'LS Karstlenstrasse';
update objekte set objekt_nr = '10034', abo_betrag = 1890 where name = 'LS Nord/Zschokkestrasse';
update objekte set objekt_nr = '10035', abo_betrag = 346 where name = 'LS Probusweg';
update objekte set objekt_nr = '10011', abo_betrag = 1365 where name = 'LS Schaffhauserstrasse 104';
update objekte set objekt_nr = '10041', abo_betrag = 420 where name = 'LS Schaffhauserstrasse 92';
update objekte set objekt_nr = '10032', abo_betrag = 420 where name = 'LS Schaffhauserstrasse 94';
update objekte set objekt_nr = '10029', abo_betrag = 819 where name = 'LS Schürbunertweg';
update objekte set objekt_nr = '10012', abo_betrag = 1732.5 where name = 'LS Steinackerstrasse';
update objekte set objekt_nr = '10042', abo_betrag = 450 where name = 'LS STWG Bahnhofstrasse';
update objekte set objekt_nr = '10021', abo_betrag = 325 where name = 'Milliman AG';
update objekte set abo_betrag = 1090 where name = 'Apartment + Aufenthaltsraum Chaesernweg';
update objekte set abo_betrag = null where name = 'Jugendarbeit Steinackerstrasse';
update objekte set abo_betrag = 445 where name = 'Burgring ZueriOberland Geschaeftshaus';
update objekte set abo_betrag = 640 where name = 'LS Hofackerstrasse';
update objekte set abo_betrag = 500 where name = 'MFW Blumenfeldstrasse';
update objekte set abo_betrag = 510.7 where name = 'Spital Limmattal Regensdorf';
update objekte set abo_betrag = null where name = 'Audika AG';
update objekte set abo_betrag = 2100 where name = 'Baeckerei-Konditorei Birmensdorf';

-- ---------------------------------------------------------------
-- 3. Monat Februar 2026 mit den Ansaetzen aus dem geprueften Blatt
-- ---------------------------------------------------------------
insert into kalk_monat (monat, ahv, alv, nbu, bu, ktg_objekt, ktg_personal, rpk, fak, ml13,
    nbu_schwelle, nbu_traegt_ag, bvg_satz, bvg_eintritt, bvg_koord, bvg_min, bvg_max,
    mat, mas, trs, trs_topf, trs_schluessel, admin_reserve, notiz)
  values ('2026-02-01', 0.053, 0.011, 0.0138, 0.014494, 0.00796, 0.00825, 0.002, 0.012, 0.0833,
    8, false, 0.07, 22680, 26460, 3780, 64260,
    15, 15, 0, 1400, 'abos', 0.10,
    'Aus Kalkulationstabelle_DELS.xlsx uebernommen und gegen das Excel geprueft. Treibstoff steht im trs_topf statt in den Adminkosten, die Trs-Pauschale ist deshalb 0. NBU traegt laut Art. 91 UVG der Arbeitnehmer, daher nbu_traegt_ag = false.')
  on conflict (monat) do nothing;

-- ---------------------------------------------------------------
-- 4. Adminkosten Februar (Kostenuebersicht.xlsx, ohne Treibstoff)
-- ---------------------------------------------------------------
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

-- ---------------------------------------------------------------
-- 5. Objekte im Monat Februar
-- ---------------------------------------------------------------
delete from kalk_objekt_monat where monat = '2026-02-01';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1670, 33.25, 32.5, 1, true from objekte where name = 'Frauenpraxis Uster West';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 390, 4, 25.46, 1, true from objekte where name = 'Friedhof Chloos';
insert into kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, lohn_manuell, ma, aktiv)
  select '2026-02-01', id, 1090, 8, 26, 1, true from objekte where name = 'Apartment + Aufenthaltsraum Chaesernweg';
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
  select '2026-02-01', id, 445, 6, 25.46, 1, true from objekte where name = 'Burgring ZueriOberland Geschaeftshaus';
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
  select '2026-02-01', id, 2100, 48, 25.46, 1, true from objekte where name = 'Baeckerei-Konditorei Birmensdorf';

-- Kontrolle: erwartet 34 Zeilen und Abosumme 27655.70
-- select count(*), sum(abo_betrag) from kalk_objekt_monat where monat = '2026-02-01';
