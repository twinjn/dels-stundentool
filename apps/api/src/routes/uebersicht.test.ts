/**
 * Tests für die Jahresuebersicht.
 *
 * Schwerpunkt: dass die Einträge im richtigen Monat und in der richtigen
 * Art landen. Eine Matrix, die Werte um eine Spalte verschiebt, sieht
 * völlig richtig aus, und genau deshalb wird hier auf den Monat genau
 * geprueft.
 */
import { eq, inArray, like } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import { benutzer, eintraege, mitarbeiter, objekte, protokoll, sitzungen } from "../db/schema.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("jahr");
const MAIL = `${marke}@dels.ch`;
const JAHR = 2035;

let benutzerId: string;
let aktivId: string;
let ausgetretenId: string;
let objektId: string;

beforeAll(async () => {
  benutzerId = await benutzerAnlegen(`${marke} Buero`, MAIL, "buero");

  const [a] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Aktiv`, personalnummer: `${marke}-A`, ferienanspruch: "25" })
    .returning({ id: mitarbeiter.id });
  aktivId = a!.id;

  const [b] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Weg`, personalnummer: `${marke}-W`, aktiv: false })
    .returning({ id: mitarbeiter.id });
  ausgetretenId = b!.id;

  const [o] = await db
    .insert(objekte)
    .values({ name: `${marke} Objekt`, objektNr: `${marke}-1` })
    .returning({ id: objekte.id });
  objektId = o!.id;

  await db.insert(eintraege).values([
    // Januar und Dezember: die beiden Ränder der Matrix.
    { mitarbeiterId: aktivId, objektId, datum: `${JAHR}-01-15`, art: "arbeit", wert: "7.00" },
    { mitarbeiterId: aktivId, objektId, datum: `${JAHR}-12-31`, art: "arbeit", wert: "3.00" },
    { mitarbeiterId: aktivId, objektId, datum: `${JAHR}-06-10`, art: "arbeit", wert: "5.50" },
    { mitarbeiterId: aktivId, objektId: null, datum: `${JAHR}-06-11`, art: "ferien", wert: "1.00" },
    {
      mitarbeiterId: aktivId,
      objektId: null,
      datum: `${JAHR}-03-02`,
      art: "krankheit",
      wert: "2.00",
    },
    // Ein Tag im Folgejahr darf nicht mitzaehlen.
    { mitarbeiterId: aktivId, objektId, datum: `${JAHR + 1}-01-02`, art: "arbeit", wert: "99.00" },
    // Die ausgetretene Person hat nur im Vorjahr gearbeitet.
    {
      mitarbeiterId: ausgetretenId,
      objektId,
      datum: `${JAHR - 1}-05-05`,
      art: "arbeit",
      wert: "4.00",
    },
  ]);
});

afterAll(async () => {
  await db.delete(protokoll).where(eq(protokoll.benutzerId, benutzerId));
  await db.delete(eintraege).where(inArray(eintraege.mitarbeiterId, [aktivId, ausgetretenId]));
  await db.delete(mitarbeiter).where(like(mitarbeiter.name, `${marke}%`));
  await db.delete(objekte).where(like(objekte.name, `${marke}%`));
  await db.delete(sitzungen).where(eq(sitzungen.benutzerId, benutzerId));
  await db.delete(benutzer).where(eq(benutzer.id, benutzerId));
  await datenbankSchliessen();
});

async function holeJahr(jahr = JAHR, alle = false) {
  const klient = await anmelden(app, MAIL);
  const antwort = await klient.get(`/api/uebersicht?jahr=${jahr}&alle=${alle}`);
  expect(antwort.status).toBe(200);
  return antwort.body as {
    jahr: number;
    mitarbeiter: {
      name: string;
      monate: Record<string, number>[];
      jahr: Record<string, number>;
      ferienanspruch: number;
    }[];
  };
}

describe("Matrix", () => {
  test("Werte landen im richtigen Monat", async () => {
    const daten = await holeJahr();
    const person = daten.mitarbeiter.find((p) => p.name === `${marke} Aktiv`)!;

    expect(person.monate).toHaveLength(12);
    expect(person.monate[0]!.arbeit).toBeCloseTo(7, 6); // Januar
    expect(person.monate[5]!.arbeit).toBeCloseTo(5.5, 6); // Juni
    expect(person.monate[11]!.arbeit).toBeCloseTo(3, 6); // Dezember
    // Kein Wert in einem Monat ohne Eintrag.
    expect(person.monate[6]!.arbeit).toBe(0);
  });

  test("Arten werden getrennt geführt", async () => {
    const daten = await holeJahr();
    const person = daten.mitarbeiter.find((p) => p.name === `${marke} Aktiv`)!;

    expect(person.monate[5]!.ferien).toBeCloseTo(1, 6);
    expect(person.monate[5]!.krankheit).toBe(0);
    expect(person.monate[2]!.krankheit).toBeCloseTo(2, 6);
    expect(person.jahr.ferien).toBeCloseTo(1, 6);
    expect(person.jahr.krankheit).toBeCloseTo(2, 6);
  });

  test("die Jahressumme ist die Summe der Monate", async () => {
    const daten = await holeJahr();
    const person = daten.mitarbeiter.find((p) => p.name === `${marke} Aktiv`)!;

    const ausMonaten = person.monate.reduce((a, m) => a + m.arbeit!, 0);
    expect(person.jahr.arbeit).toBeCloseTo(ausMonaten, 6);
    expect(person.jahr.arbeit).toBeCloseTo(15.5, 6);
  });

  test("ein Eintrag im Folgejahr zählt nicht mit", async () => {
    const daten = await holeJahr();
    const person = daten.mitarbeiter.find((p) => p.name === `${marke} Aktiv`)!;
    // 99 Stunden am 2. Januar des Folgejahres dürfen nirgends auftauchen.
    expect(person.jahr.arbeit).toBeCloseTo(15.5, 6);

    const naechstes = await holeJahr(JAHR + 1);
    const dort = naechstes.mitarbeiter.find((p) => p.name === `${marke} Aktiv`)!;
    expect(dort.monate[0]!.arbeit).toBeCloseTo(99, 6);
  });
});

describe("Wer erscheint", () => {
  test("Ausgetretene ohne Einträge im Jahr bleiben draussen", async () => {
    const daten = await holeJahr();
    expect(daten.mitarbeiter.some((p) => p.name === `${marke} Weg`)).toBe(false);
  });

  test("mit alle=true sind sie dabei", async () => {
    const daten = await holeJahr(JAHR, true);
    expect(daten.mitarbeiter.some((p) => p.name === `${marke} Weg`)).toBe(true);
  });

  test("Ausgetretene MIT Einträgen im Jahr sind auch ohne alle=true dabei", async () => {
    const daten = await holeJahr(JAHR - 1);
    const weg = daten.mitarbeiter.find((p) => p.name === `${marke} Weg`);
    expect(weg).toBeDefined();
    expect(weg!.jahr.arbeit).toBeCloseTo(4, 6);
  });
});

describe("Rechte und Eingaben", () => {
  test("ohne Anmeldung 401", async () => {
    expect((await request(app).get("/api/uebersicht?jahr=2026")).status).toBe(401);
  });

  test("unsinnige Jahre werden abgelehnt", async () => {
    const klient = await anmelden(app, MAIL);
    expect((await klient.get("/api/uebersicht?jahr=1850")).status).toBe(400);
    expect((await klient.get("/api/uebersicht?jahr=quatsch")).status).toBe(400);
  });
});

describe("Export", () => {
  test("ein Blatt je Art plus das Ferienblatt, alle mit eigenem Namen", async () => {
    const klient = await anmelden(app, MAIL);
    const antwort = await klient.get(`/api/export/uebersicht?jahr=${JAHR}`).responseType("blob");

    expect(antwort.status).toBe(200);
    const mappe = XLSX.read(antwort.body, { type: "buffer" });

    expect(mappe.SheetNames).toEqual([
      "Arbeit",
      "Ferien",
      "Krankheit",
      "Unfall",
      "Feiertag",
      "Sonstiges",
      "Ferien Anspruch",
    ]);
    // Keine automatisch angehängte 2: die Namen sind von sich aus eindeutig.
    expect(mappe.SheetNames.some((n) => /\s\d$/.test(n))).toBe(false);
  });

  test("die Zahlen im Blatt stimmen mit der Ansicht überein", async () => {
    const daten = await holeJahr();
    const person = daten.mitarbeiter.find((p) => p.name === `${marke} Aktiv`)!;

    const klient = await anmelden(app, MAIL);
    const antwort = await klient.get(`/api/export/uebersicht?jahr=${JAHR}`).responseType("blob");
    const mappe = XLSX.read(antwort.body, { type: "buffer" });

    const zeilen = XLSX.utils.sheet_to_json(mappe.Sheets["Arbeit"]!, {
      header: 1,
      defval: null,
    }) as unknown[][];
    const zeile = zeilen.find((z) => z[1] === `${marke} Aktiv`)!;

    expect(zeile[2]).toBe(person.monate[0]!.arbeit); // Januar
    expect(zeile[13]).toBe(person.monate[11]!.arbeit); // Dezember
    expect(zeile[14]).toBe(person.jahr.arbeit); // Total
  });

  test("Blätter ohne Einträge bleiben leer statt voller Nullen", async () => {
    const klient = await anmelden(app, MAIL);
    const antwort = await klient.get(`/api/export/uebersicht?jahr=${JAHR}`).responseType("blob");
    const mappe = XLSX.read(antwort.body, { type: "buffer" });

    const zeilen = XLSX.utils.sheet_to_json(mappe.Sheets["Unfall"]!, {
      header: 1,
      defval: null,
    }) as unknown[][];
    // Diese Testperson hat keinen Unfall, also darf sie hier nicht stehen.
    expect(zeilen.some((z) => z[1] === `${marke} Aktiv`)).toBe(false);
  });
});
