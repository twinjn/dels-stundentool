/**
 * Testet den Import gegen eine Attrappe des alten Supabase-Schemas.
 *
 * Warum nicht direkt gegen die echte Quelle: ein Migrationsskript probiert
 * man nicht zum ersten Mal an Produktivdaten aus. Hier liegen erfundene
 * Daten mit genau den Eigenschaften, die schiefgehen koennten:
 * sechsstellige Nachkommazahlen, Datumswerte und umbenannte Spalten.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { config } from "../config.js";
import { importiere } from "./import.js";
import { erstellePool } from "./index.js";

const SCHEMA = "alt_probe";

// Feste IDs, damit der Test hinterher genau seine eigenen Zeilen aufraeumt.
const MITARBEITER = "11111111-1111-4111-8111-111111111111";
const OBJEKT = "22222222-2222-4222-8222-222222222222";
const EINTRAG = "33333333-3333-4333-8333-333333333333";
const ADMINKOSTEN = "44444444-4444-4444-8444-444444444444";
const MONAT = "2026-02-01";

let quelle: pg.Pool;
let ziel: pg.Pool;

async function raeumeZielAuf() {
  await ziel.query("delete from kalk_person_monat where mitarbeiter_id = $1", [MITARBEITER]);
  await ziel.query("delete from kalk_objekt_monat where objekt_id = $1", [OBJEKT]);
  await ziel.query("delete from kalk_adminkosten where id = $1", [ADMINKOSTEN]);
  await ziel.query("delete from eintraege where id = $1", [EINTRAG]);
  await ziel.query("delete from kalk_monat where monat = $1", [MONAT]);
  await ziel.query("delete from objekte where id = $1", [OBJEKT]);
  await ziel.query("delete from mitarbeiter where id = $1", [MITARBEITER]);
}

beforeAll(async () => {
  // Ueber erstellePool, damit die Datumseinstellung sicher greift.
  quelle = erstellePool(config.DATABASE_URL);
  ziel = erstellePool(config.DATABASE_URL);

  await quelle.query(`drop schema if exists ${SCHEMA} cascade`);
  await quelle.query(`create schema ${SCHEMA}`);

  // Das alte Schema, so wie es in Supabase aussieht.
  await quelle.query(`
    create table ${SCHEMA}.employees (
      id uuid primary key, name text not null, ferienanspruch numeric,
      soll_pro_tag numeric, mitarbeiterstufe text, personalnummer text,
      geburtsdatum date, eintrittsdatum date, telefon text, email text,
      strasse text, plz text, ort text, ahv_nummer text, iban text,
      stundenlohn numeric, monatslohn numeric, created_at timestamptz default now());

    create table ${SCHEMA}.objekte (
      id uuid primary key, name text not null, objekt_nr text, kunde text,
      strasse text, plz text, ort text, abo_betrag numeric,
      aktiv boolean default true, notizen text, created_at timestamptz default now());

    create table ${SCHEMA}.entries (
      id uuid primary key, employee_id uuid, objekt_id uuid, date date,
      type text, value numeric, note text, created_at timestamptz default now());

    create table ${SCHEMA}.kalk_monat (
      monat date primary key, ahv numeric, alv numeric, nbu numeric, bu numeric,
      ktg_objekt numeric, ktg_personal numeric, rpk numeric, fak numeric, ml13 numeric,
      nbu_schwelle numeric, nbu_traegt_ag boolean, bvg_satz numeric, bvg_eintritt numeric,
      bvg_koord numeric, bvg_min numeric, bvg_max numeric, mat numeric, mas numeric,
      trs numeric, trs_topf numeric, trs_schluessel text, admin_reserve numeric,
      notiz text, created_at timestamptz default now());

    create table ${SCHEMA}.kalk_adminkosten (
      id uuid primary key, monat date, position text, betrag numeric, sortierung int);

    create table ${SCHEMA}.kalk_objekt_monat (
      monat date, objekt_id uuid, abo_betrag numeric, std_manuell numeric,
      lohn_manuell numeric, ma numeric, aktiv boolean, primary key (monat, objekt_id));

    create table ${SCHEMA}.kalk_person_monat (
      monat date, employee_id uuid, lohn numeric, spesen numeric, ml13 boolean,
      abzug_ahv boolean, abzug_alv boolean, abzug_rpk boolean, abzug_fak boolean,
      fak_manuell numeric, bvg boolean, bvg_manuell numeric, primary key (monat, employee_id));
  `);

  await quelle.query(
    `insert into ${SCHEMA}.employees (id, name, ferienanspruch, soll_pro_tag, mitarbeiterstufe, monatslohn)
     values ($1, 'Erfundene Person', 25, 8.4, 'A', 5200.50)`,
    [MITARBEITER],
  );
  await quelle.query(
    `insert into ${SCHEMA}.objekte (id, name, objekt_nr, abo_betrag, aktiv)
     values ($1, 'Erfundenes Objekt', 'O-42', 1250.00, true)`,
    [OBJEKT],
  );
  await quelle.query(
    `insert into ${SCHEMA}.entries (id, employee_id, objekt_id, date, type, value, note)
     values ($1, $2, $3, '2026-02-01', 'arbeit', 8.40, 'Notiz aus dem Altsystem')`,
    [EINTRAG, MITARBEITER, OBJEKT],
  );
  await quelle.query(
    `insert into ${SCHEMA}.kalk_monat (monat, ahv, alv, nbu, bu, ktg_objekt, ktg_personal,
       rpk, fak, ml13, nbu_schwelle, nbu_traegt_ag, bvg_satz, bvg_eintritt, bvg_koord,
       bvg_min, bvg_max, mat, mas, trs, trs_topf, trs_schluessel, admin_reserve)
     values ($1, 0.053, 0.011, 0.0138, 0.014494, 0.00796, 0.00825, 0.002, 0.012, 0.0833,
       8, false, 0.07, 22680, 26460, 3780, 64260, 15, 15, 0, 0, 'abos', 0.10)`,
    [MONAT],
  );
  await quelle.query(
    `insert into ${SCHEMA}.kalk_adminkosten (id, monat, position, betrag, sortierung)
     values ($1, $2, 'Buchhaltung', 480, 1)`,
    [ADMINKOSTEN, MONAT],
  );
  await quelle.query(
    `insert into ${SCHEMA}.kalk_objekt_monat (monat, objekt_id, abo_betrag, std_manuell, ma, aktiv)
     values ($1, $2, 1250.00, 12.50, 2, true)`,
    [MONAT, OBJEKT],
  );
  await quelle.query(
    `insert into ${SCHEMA}.kalk_person_monat (monat, employee_id, lohn, spesen, ml13,
       abzug_ahv, abzug_alv, abzug_rpk, abzug_fak, bvg)
     values ($1, $2, 5200.50, 120, true, true, true, true, true, true)`,
    [MONAT, MITARBEITER],
  );

  await raeumeZielAuf();
});

afterAll(async () => {
  await raeumeZielAuf();
  await quelle.query(`drop schema if exists ${SCHEMA} cascade`);
  await quelle.end();
  await ziel.end();
});

describe("Import aus dem Altsystem", () => {
  test("uebernimmt alle sieben Tabellen", async () => {
    const bericht = await importiere(quelle, ziel, { quellSchema: SCHEMA });
    expect(bericht).toEqual({
      mitarbeiter: 1,
      objekte: 1,
      kalk_monat: 1,
      eintraege: 1,
      kalk_adminkosten: 1,
      kalk_objekt_monat: 1,
      kalk_person_monat: 1,
    });
  });

  test("benennt die Spalten richtig um", async () => {
    const { rows } = await ziel.query(
      "select mitarbeiter_id, objekt_id, datum, art, wert, notiz from eintraege where id = $1",
      [EINTRAG],
    );
    expect(rows[0]).toMatchObject({
      mitarbeiter_id: MITARBEITER,
      objekt_id: OBJEKT,
      art: "arbeit",
      wert: "8.40",
      notiz: "Notiz aus dem Altsystem",
    });
  });

  test("das Datum verschiebt sich beim Umzug nicht", async () => {
    const { rows } = await ziel.query("select datum from eintraege where id = $1", [EINTRAG]);
    expect(rows[0]?.datum).toBe("2026-02-01");
  });

  test("Sozialversicherungssaetze kommen unveraendert an", async () => {
    const { rows } = await ziel.query("select bu, ahv, ml13 from kalk_monat where monat = $1", [
      MONAT,
    ]);
    // Der entscheidende Wert: 1.4494 Prozent darf nicht zu 1 Prozent werden.
    expect(rows[0]?.bu).toBe("0.014494");
    expect(rows[0]?.ahv).toBe("0.053000");
    expect(rows[0]?.ml13).toBe("0.083300");
  });

  test("Loehne bleiben auf den Rappen genau", async () => {
    const { rows } = await ziel.query(
      "select lohn from kalk_person_monat where monat = $1 and mitarbeiter_id = $2",
      [MONAT, MITARBEITER],
    );
    expect(rows[0]?.lohn).toBe("5200.50");
  });

  test("bricht vollstaendig ab, wenn eine Tabelle Mist enthaelt", async () => {
    // Zweiter Durchlauf mit derselben ID: der Primaerschluessel muss
    // zuschlagen. Wichtig ist, dass dabei NICHTS halb importiert bleibt.
    await expect(importiere(quelle, ziel, { quellSchema: SCHEMA })).rejects.toThrow();

    const { rows } = await ziel.query(
      "select count(*)::int as anzahl from eintraege where id = $1",
      [EINTRAG],
    );
    expect(rows[0]?.anzahl).toBe(1);
  });
});
