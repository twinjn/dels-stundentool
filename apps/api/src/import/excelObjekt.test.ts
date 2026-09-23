/**
 * Tests fuer den Import der Objektdateien.
 *
 * Wieder mit einer selbst gebauten Mappe im echten Format: die
 * Vorlagendatei, die zum Pruefen vorlag, war komplett leer, und echte
 * Objektdateien gehoeren nicht ins Repository.
 */
import XLSX from "xlsx";
import { describe, expect, test } from "vitest";
import { summenNachrechnen } from "./excel.js";
import { leseObjektblatt, objektnummerAusBlatt, zusammenfuehren } from "./excelObjekt.js";

const VOR_DEN_TAGEN = 3; // A=PersNr, B=Name, C=KA
const SUMMEN_AB = 34; // Spalte AI, nullbasiert

type Tage = Record<number, string | number>;

function person(pernr: string, name: string, tage: Tage, summen: number[] = []) {
  const z: (string | number | null)[] = new Array(VOR_DEN_TAGEN + 31 + 7).fill(null);
  z[0] = pernr;
  z[1] = name;
  for (const [tag, wert] of Object.entries(tage)) {
    z[VOR_DEN_TAGEN + Number(tag) - 1] = wert;
  }
  summen.forEach((w, i) => {
    z[SUMMEN_AB + i] = w;
  });
  return z;
}

function baueObjektmappe(
  personen: (string | number | null)[][],
  objektNr = "10002",
  blattname = "Februar",
): XLSX.WorkBook {
  const kopf2: (string | number | null)[] = new Array(12).fill(null);
  kopf2[0] = 2026;
  kopf2[3] = "Objekt:";
  kopf2[6] = objektNr;

  const kopf4: (string | number | null)[] = new Array(VOR_DEN_TAGEN + 31 + 7).fill(null);
  kopf4[0] = "PersNr.";
  kopf4[1] = "Name";
  kopf4[2] = "KA";
  kopf4[SUMMEN_AB] = "Arbeit";

  const schluss: (string | number | null)[] = new Array(VOR_DEN_TAGEN + 31 + 7).fill(null);
  schluss[0] = "Monatstotal Arbeit";

  const alles = [[], kopf2, [], kopf4, ...personen, schluss];
  const blatt = XLSX.utils.aoa_to_sheet(alles);
  const mappe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mappe, blatt, blattname);
  return mappe;
}

describe("Objektdatei lesen", () => {
  test("holt die Objektnummer aus dem Kopf", () => {
    const mappe = baueObjektmappe([], "10042");
    expect(objektnummerAusBlatt(mappe, "Februar")).toBe("10042");
  });

  test("bucht Stunden auf das Objekt der Datei", () => {
    const mappe = baueObjektmappe([person("1010", "Erfundene Person", { 2: 1.75, 3: 2 })]);
    const e = leseObjektblatt(mappe, "Februar", 2026);

    expect(e.warnungen).toEqual([]);
    expect(e.eintraege).toEqual([
      {
        personalnummer: "1010",
        objektNr: "10002",
        datum: "2026-02-02",
        art: "arbeit",
        wert: "1.75",
      },
      {
        personalnummer: "1010",
        objektNr: "10002",
        datum: "2026-02-03",
        art: "arbeit",
        wert: "2.00",
      },
    ]);
  });

  test("hört bei der Monatstotal-Zeile auf", () => {
    const mappe = baueObjektmappe([person("1010", "Person", { 2: 8 })]);
    // Nach der Schlusszeile darf nichts mehr gelesen werden.
    expect(leseObjektblatt(mappe, "Februar", 2026).eintraege).toHaveLength(1);
  });

  test("Abwesenheiten bekommen kein Objekt", () => {
    const mappe = baueObjektmappe([person("1010", "Person", { 5: "F", 6: "K" })]);
    const e = leseObjektblatt(mappe, "Februar", 2026);

    expect(e.eintraege.map((x) => [x.art, x.objektNr])).toEqual([
      ["ferien", null],
      ["krankheit", null],
    ]);
  });

  test('"Fr" bleibt dagegen am Objekt', () => {
    const mappe = baueObjektmappe([person("1010", "Person", { 5: "Fr" })]);
    const e = leseObjektblatt(mappe, "Februar", 2026);
    expect(e.eintraege[0]).toMatchObject({ art: "frei", objektNr: "10002" });
  });

  test("Spalten hinter dem Monatsende werden gemeldet", () => {
    const mappe = baueObjektmappe([person("1010", "Person", { 28: 8, 30: 8 })]);
    const e = leseObjektblatt(mappe, "Februar", 2026);
    expect(e.eintraege).toHaveLength(1);
    expect(e.warnungen.some((w) => /hinter dem Monatsende/.test(w))).toBe(true);
  });

  test("eine leere Vorlagendatei liefert nichts und meckert nicht", () => {
    const mappe = baueObjektmappe([person("0", "", {}), person("0", "", {})]);
    const e = leseObjektblatt(mappe, "Februar", 2026);
    expect(e.eintraege).toEqual([]);
    expect(e.warnungen).toEqual([]);
  });
});

describe("Mehrere Objektdateien zusammenfuehren", () => {
  test("Ferien derselben Person zählen einmal, nicht je Datei", () => {
    // Der entscheidende Fall: wer auf drei Objekten arbeitet, hat seine
    // Ferien in drei Dateien stehen. Ohne Entdopplung waeren das drei Tage.
    const ausDrei = ["10002", "10003", "10004"].map((nr) => {
      const mappe = baueObjektmappe([person("1010", "Person", { 5: "F" })], nr);
      return leseObjektblatt(mappe, "Februar", 2026).eintraege;
    });

    const { eintraege, warnungen } = zusammenfuehren(ausDrei);
    expect(warnungen).toEqual([]);
    expect(eintraege.filter((e) => e.art === "ferien")).toHaveLength(1);
    expect(summenNachrechnen(eintraege).get("1010|2026-02")?.ferien).toBe(1);
  });

  test("gearbeitete Stunden bleiben dagegen alle erhalten", () => {
    const ausZwei = ["10002", "10003"].map((nr) => {
      const mappe = baueObjektmappe([person("1010", "Person", { 5: 4 })], nr);
      return leseObjektblatt(mappe, "Februar", 2026).eintraege;
    });

    const { eintraege } = zusammenfuehren(ausZwei);
    expect(eintraege).toHaveLength(2);
    expect(summenNachrechnen(eintraege).get("1010|2026-02")?.arbeit).toBe(8);
  });

  test("widerspruechliche Kuerzel in zwei Dateien werden gemeldet", () => {
    const a = leseObjektblatt(
      baueObjektmappe([person("1010", "Person", { 5: "F" })], "10002"),
      "Februar",
      2026,
    ).eintraege;
    const b = leseObjektblatt(
      baueObjektmappe([person("1010", "Person", { 5: "K" })], "10003"),
      "Februar",
      2026,
    ).eintraege;

    const { eintraege, warnungen } = zusammenfuehren([a, b]);
    expect(eintraege.filter((e) => e.objektNr === null)).toHaveLength(1);
    expect(warnungen[0]).toMatch(/verschiedene Kuerzel/);
  });

  test('"Frei" auf zwei Objekten bleibt zweimal stehen', () => {
    // Es gehoert zum Objekt, nicht zur Person, also ist das kein Doppel.
    const ausZwei = ["10002", "10003"].map(
      (nr) =>
        leseObjektblatt(baueObjektmappe([person("1010", "P", { 5: "Fr" })], nr), "Februar", 2026)
          .eintraege,
    );
    expect(zusammenfuehren(ausZwei).eintraege).toHaveLength(2);
  });
});
