-- Import: Objekte aus Kundenliste
-- Im Supabase Dashboard unter "SQL Editor" ausführen.
-- Fünf Zeilen fehlen noch (Adresse in der Vorlage abgeschnitten) und werden separat ergänzt:
-- Stadt Kloten Liegenschaften (Apartment/Aufenthaltsraum Chäsernweg), Burgring ZüriOberland AG (Bahnhofstr. 63),
-- Burgring ZüriOberland AG (Elsässer Unternehmensstiftung), Ruben Kretschmar & Angelika Hilbeck, Spital Limmattal.

insert into objekte (name, strasse, plz, ort, kunde) values
  ('Frauenpraxis Uster West', 'Uster West 32', '8610', 'Uster', 'Dr. med. Hefermehl Laura + Med. pract. Cardall-Na'),
  ('Friedhof Chloos', 'Chloos 1', '8302', 'Kloten', 'Stadt Kloten Liegenschaften'),
  ('Dreifach Kindergarten Geissberg', 'Geissberg 1,2 + 3, Auenstr. 45', '8302', 'Kloten', 'Stadt Kloten Liegenschaften'),
  ('KIGA Hochrainli', 'Thalwiesenstrasse 16', '8302', 'Kloten', 'Stadt Kloten Liegenschaften'),
  ('LS Steinackerstrasse', 'Steinackerstr. 2/2a', '8302', 'Kloten', 'Beltopo Immobilien AG'),
  ('Apotheke Drogerie Brunaupark', 'Giesshübelstr. 65', '8045', 'Zürich', 'Apotheke Drogerie Brunaupark'),
  ('Milliman AG', 'Holbeinstrasse 31', '8008', 'Zürich', 'Milliman AG'),
  ('LS Schaffhauserstrasse 104', 'Schaffhauserstr. 104', '8152', 'Glattbrugg', 'Burgring AG Immobilien'),
  ('LS Schaffhauserstrasse 92', 'Schaffhauserstr. 92', '8152', 'Glattbrugg', 'Burgring AG Immobilien'),
  ('LS Schaffhauserstrasse 94', 'Schaffhauserstr. 94', '8152', 'Glattbrugg', 'Burgring AG Immobilien'),
  ('LS Schürbunertweg', 'Schürbunertweg 10', '8302', 'Kloten', 'Burgring AG Immobilien'),
  ('LS Karstlenstrasse', 'Karstlenstr. 11', '8048', 'Zürich', 'Burgring AG Immobilien'),
  ('LS Erlachstrasse', 'Erlachstr. 25', '8003', 'Zürich', 'Burgring AG Immobilien'),
  ('LS Nord/Zschokkestrasse', 'Nord/Zschokkestr.', '8037', 'Zürich', 'Burgring AG Immobilien'),
  ('LS Probusweg', 'Probusweg 10', '8050', 'Zürich', 'Burgring AG Immobilien'),
  ('FC Othmarsingen', 'Falkenmatt', '5504', 'Othmarsingen', 'FC Othmarsingen'),
  ('IDEOGEN AG', 'Hurdnerstrasse 129', '8640', 'Hurden SZ', 'IDEOGEN AG'),
  ('Baloise Versicherung AG', 'Rathausstrasse 11', '8570', 'Weinfelden', 'Baloise Versicherung AG'),
  ('LS STWG Bahnhofstrasse', 'Bahnhofstrasse 22', '5506', 'Mägenwil', 'NBS Immobilien - Verwaltung GmbH'),
  ('AIL Swiss-Austria Leasing AG', 'Schaffhauserstr. 104', '8152', 'Glattbrugg', 'AIL Swiss-Austria Leasing AG'),
  ('Baulink AG', 'Schaffhauserstr. 104', '8152', 'Glattbrugg', 'Baulink AG'),
  ('Büro 2. OG Gerbegasse', 'Gerbegasse 2', '8302', 'Kloten', 'Stadt Kloten'),
  ('Hong Kong Oerlikon Vertex', 'Thurgauerstrasse 32', null, null, 'Hong Kong Gastro AG'),
  ('Hong Kong Sihlcity', 'Kalanderplatz 1', null, null, 'Hong Kong Gastro AG'),
  ('Max Bill Platz', 'Binzmühlestrasse 104', '8050', 'Zürich', 'Hong Kong Food Paradise AG'),
  ('KIND Hörzentrale AG', 'Hertensteinstrasse 8', '6000', 'Luzern', 'KIND Hörzentrale AG'),
  ('Bäckerei-Konditorei Zürcherstrasse', 'Zürcherstrasse 46', '8142', 'Uitikon-Waldegg', 'Bäckerei-Konditorei Bode'),
  ('Bäckerei-Konditorei Reppischtalstrasse', 'Reppischtalstrasse 54', '8143', 'Stallikon', 'Bäckerei-Konditorei Bode');
