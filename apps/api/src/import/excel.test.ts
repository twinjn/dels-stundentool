/**
 * Tests für den Excel-Import.
 *
 * Gebaut wird eine Mappe im echten Format, aber mit erfundenen Daten.
 * So laufen die Tests überall, auch in der CI, und es liegen keine
 * Personendaten im Repository.
 *
 * Die Fälle stammen alle aus der echten Datei: doppelt gesetzte
 * Abwesenheiten, eine vergessene Markierung, "Fr" statt "FF",
 * kleingeschriebene Kürzel und das 31-Spalten-Raster im Februar.
 */
import XLSX from "xlsx";
import { describe, expect, test } from "vitest";
import { leseVerwaltungsblatt, summenNachrechnen } from "./excel.js";

/** Spalte I ist der erste Tag. Davor liegen acht Spalten. */
const VOR_DEN_TAGEN = 8;
const SUMMEN_AB = 39; // Spalte AN, nullbasiert

type Tage = Record<number, string | number>;

function zeile(
  zcode: number,
  pernr: string,
  nameOderObjekt: string,
  objektNr: string,
  tage: Tage,
  summen: number[] = [],
): (string | number | null)[] {
  const z: (string | number | null)[] = new Array(VOR_DEN_TAGEN + 31 + 6).fill(null);
  z[0] = zcode;
  z[2] = pernr;
  z[3] = nameOderObjekt;
  z[4] = objektNr;
  for (const [tag, wert] of Object.entries(tage)) {
    z[VOR_DEN_TAGEN + Number(tag) - 1] = wert;
  }
  summen.forEach((w, i) => {
    z[SUMMEN_AB + i] = w;
  });
  return z;
}

function baueMappe(
  datenzeilen: (string | number | null)[][],
  blattname = "Februar",
): XLSX.WorkBook {
  const kopf: (string | number | null)[] = new Array(VOR_DEN_TAGEN + 31 + 6).fill(null);
  kopf[0] = "ZCode";
  kopf[2] = "PerNr.";
  kopf[3] = "Name / Objekt";
  kopf[4] = "Obj. Nr.";
  kopf[SUMMEN_AB] = "Arbeit";

  const alles = [[], [], [], [], kopf, ...datenzeilen];
  const blatt = XLSX.utils.aoa_to_sheet(alles);
  const mappe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mappe, blatt, blattname);
  return mappe;
}

describe("Stunden lesen", () => {
  test("bucht Stunden auf das Objekt der Zeile", () => {
    const mappe = baueMappe([
      zeile(1, "1001", "Erfundene Person", "0", {}, [16.8]),
      zeile(2, "1001", "Objekt A", "10001", { 2: 8.4, 3: 8.4 }),
    ]);

    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.warnungen).toEqual([]);
    expect(e.eintraege).toHaveLength(2);
    expect(e.eintraege[0]).toEqual({
      personalnummer: "1001",
      objektNr: "10001",
      datum: "2026-02-02",
      art: "arbeit",
      wert: "8.40",
    });
  });

  test("Nullen sind keine Erfassung", () => {
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, [0]),
      zeile(2, "1001", "Objekt A", "10001", { 1: 0, 2: 0 }),
    ]);
    expect(leseVerwaltungsblatt(mappe, "Februar", 2026).eintraege).toHaveLength(0);
  });

  test("Personenzeilen ohne Namen sind leere Rasterplätze", () => {
    const mappe = baueMappe([zeile(1, "1099", "0", "0", {}), zeile(2, "1099", "0", "0", {})]);
    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.eintraege).toHaveLength(0);
    expect(e.summenLautExcel).toHaveLength(0);
  });
});

describe("Abwesenheiten der Person", () => {
  test("dasselbe Kürzel auf zwei Objektzeilen ergibt EINEN Tag", () => {
    // Genau hier verdoppelt ein naiver Import die Ferientage.
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, [0, 2]),
      zeile(2, "1001", "Objekt A", "10001", { 2: "F", 3: "F" }),
      zeile(2, "1001", "Objekt B", "10002", { 2: "F", 3: "F" }),
    ]);

    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.warnungen).toEqual([]);
    expect(e.eintraege).toHaveLength(2);
    expect(e.eintraege.every((x) => x.art === "ferien" && x.objektNr === null)).toBe(true);
    expect(summenNachrechnen(e.eintraege).get("1001|2026-02")?.ferien).toBe(2);
  });

  test("eine vergessene Markierung wird gemeldet, der Tag zählt trotzdem ganz", () => {
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, [0, 1.5]),
      zeile(2, "1001", "Objekt A", "10001", { 2: "F", 3: "F" }),
      zeile(2, "1001", "Objekt B", "10002", { 2: "F" }), // Tag 3 fehlt
    ]);

    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.eintraege.filter((x) => x.art === "ferien")).toHaveLength(2);
    expect(e.warnungen).toHaveLength(1);
    expect(e.warnungen[0]).toMatch(/2026-02-03/);
    expect(e.warnungen[0]).toMatch(/1 von 2/);
  });

  test("kleingeschriebene Kürzel zählen genauso", () => {
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, [0, 1]),
      zeile(2, "1001", "Objekt A", "10001", { 5: "f" }),
    ]);
    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.eintraege[0]?.art).toBe("ferien");
    expect(e.warnungen).toEqual([]);
  });

  test("K, U und S werden richtig zugeordnet", () => {
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, []),
      zeile(2, "1001", "Objekt A", "10001", { 2: "K", 3: "U", 4: "S" }),
    ]);
    const arten = leseVerwaltungsblatt(mappe, "Februar", 2026).eintraege.map((x) => x.art);
    expect(arten).toEqual(["krankheit", "unfall", "sonstiges"]);
  });

  test("zwei verschiedene Kürzel am selben Tag werden gemeldet", () => {
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, []),
      zeile(2, "1001", "Objekt A", "10001", { 2: "F" }),
      zeile(2, "1001", "Objekt B", "10002", { 2: "K" }),
    ]);
    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.eintraege.filter((x) => x.datum === "2026-02-02")).toHaveLength(1);
    expect(e.warnungen.some((w) => /zwei verschiedene/.test(w))).toBe(true);
  });
});

describe('"Frei" gehört zum Objekt, nicht zur Person', () => {
  test("bleibt am Objekt und wird nicht entdoppelt", () => {
    // In der echten Datei steht Fr an verschiedenen Tagen auf verschiedenen
    // Objektzeilen, und Excel zählt es in keine Summenspalte.
    const mappe = baueMappe([
      zeile(1, "1048", "Person", "0", {}, []),
      zeile(2, "1048", "Objekt A", "10012", { 5: "Fr" }),
      zeile(2, "1048", "Objekt B", "10024", { 7: "Fr" }),
    ]);

    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.warnungen).toEqual([]);
    expect(e.eintraege).toHaveLength(2);
    expect(e.eintraege.map((x) => [x.art, x.objektNr, x.datum])).toEqual([
      ["frei", "10012", "2026-02-05"],
      ["frei", "10024", "2026-02-07"],
    ]);
  });

  test("zählt in keine Summe hinein, genau wie in Excel", () => {
    const mappe = baueMappe([
      zeile(1, "1048", "Person", "0", {}, []),
      zeile(2, "1048", "Objekt A", "10012", { 5: "Fr" }),
    ]);
    const summen = summenNachrechnen(leseVerwaltungsblatt(mappe, "Februar", 2026).eintraege);
    const zeileSumme = summen.get("1048|2026-02");
    expect(zeileSumme?.ferien).toBe(0);
    expect(zeileSumme?.sonst).toBe(0);
  });
});

describe("Raster und Randfälle", () => {
  test("Spalten hinter dem Monatsende werden uebergangen und gemeldet", () => {
    // Das Raster ist immer 31 Spalten breit, der Februar hat aber 28 Tage.
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, []),
      zeile(2, "1001", "Objekt A", "10001", { 28: 8, 30: 8 }),
    ]);

    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.eintraege).toHaveLength(1);
    expect(e.eintraege[0]?.datum).toBe("2026-02-28");
    expect(e.warnungen.some((w) => /hinter dem Monatsende/.test(w))).toBe(true);
  });

  test("Schaltjahr wird berücksichtigt", () => {
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, []),
      zeile(2, "1001", "Objekt A", "10001", { 29: 8 }),
    ]);
    // 2028 ist ein Schaltjahr, 2026 nicht.
    expect(leseVerwaltungsblatt(mappe, "Februar", 2028).eintraege[0]?.datum).toBe("2028-02-29");
    expect(leseVerwaltungsblatt(mappe, "Februar", 2026).eintraege).toHaveLength(0);
  });

  test("unbekannte Kürzel werden gemeldet statt still verschluckt", () => {
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, []),
      zeile(2, "1001", "Objekt A", "10001", { 2: "XY" }),
    ]);
    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.eintraege).toHaveLength(0);
    expect(e.warnungen[0]).toMatch(/unbekanntes Kuerzel "XY"/);
  });

  test("Stunden ohne Objektnummer werden gemeldet", () => {
    const mappe = baueMappe([
      zeile(1, "1001", "Person", "0", {}, []),
      zeile(2, "1001", "Ohne Objekt", "0", { 2: 8 }),
    ]);
    const e = leseVerwaltungsblatt(mappe, "Februar", 2026);
    expect(e.eintraege).toHaveLength(0);
    expect(e.warnungen[0]).toMatch(/ohne Objektnummer/);
  });

  test("ein fehlendes Blatt ist kein Absturz", () => {
    const e = leseVerwaltungsblatt(baueMappe([]), "Dezember", 2026);
    expect(e.eintraege).toEqual([]);
    expect(e.warnungen[0]).toMatch(/gibt es in dieser Datei nicht/);
  });
});

describe("Summen je Person und Monat", () => {
  test("der Schlüssel enthält den Monat, sonst vermischen sich die Monate", () => {
    // Genau hier lag ein Fehler: wer nur nach Personalnummer zusammenfasst,
    // vergleicht später die Jahressumme mit einer Monatssumme aus Excel.
    const februar = leseVerwaltungsblatt(
      baueMappe([
        zeile(1, "1001", "Person", "0", {}, []),
        zeile(2, "1001", "Objekt A", "10001", { 2: 4 }),
      ]),
      "Februar",
      2026,
    );
    const maerz = leseVerwaltungsblatt(
      baueMappe(
        [zeile(1, "1001", "Person", "0", {}, []), zeile(2, "1001", "Objekt A", "10001", { 2: 6 })],
        "März",
      ),
      "März",
      2026,
    );

    const summen = summenNachrechnen([...februar.eintraege, ...maerz.eintraege]);
    expect(summen.get("1001|2026-02")?.arbeit).toBe(4);
    expect(summen.get("1001|2026-03")?.arbeit).toBe(6);
    expect(summen.get("1001")).toBeUndefined();
  });
});
