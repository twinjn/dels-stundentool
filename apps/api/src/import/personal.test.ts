/**
 * Tests fuer den Personalstamm-Import.
 * Wieder mit einer selbst gebauten Mappe: echte Personaldaten gehoeren
 * nicht ins Repository.
 */
import XLSX from "xlsx";
import { describe, expect, test } from "vitest";
import { excelDatum, lesePersonalblatt } from "./personal.js";

/** Baut eine Zeile des Personalblatts. Index 0 ist Spalte A. */
function zeile(werte: Record<number, string | number | null>): (string | number | null)[] {
  const z: (string | number | null)[] = new Array(23).fill(null);
  for (const [spalte, wert] of Object.entries(werte)) z[Number(spalte)] = wert;
  return z;
}

function baueMappe(zeilen: (string | number | null)[][]): XLSX.WorkBook {
  const kopf = zeile({
    0: "PersNr.",
    1: "Gruppe",
    2: "Status",
    3: "Anrede",
    4: "Name",
    5: "Vorname",
    6: "Funktion",
    7: "Einsatzort",
    8: "Bemerkungen",
    9: "Datum",
    10: "Ferien",
    11: "F-Saldo",
  });
  const blatt = XLSX.utils.aoa_to_sheet([[], kopf, ...zeilen]);
  const mappe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mappe, blatt, "Personal");
  return mappe;
}

describe("Personalstamm lesen", () => {
  test("setzt Nachname und Vorname zusammen", () => {
    const mappe = baueMappe([zeile({ 0: "1001", 2: "Aktiv", 4: "Muster", 5: "Anna" })]);
    const { zeilen, warnungen } = lesePersonalblatt(mappe);

    expect(warnungen).toEqual([]);
    expect(zeilen).toHaveLength(1);
    // "Nachname Vorname", genau wie in den Monatsblaettern.
    expect(zeilen[0]?.name).toBe("Muster Anna");
  });

  test("Status wird zu aktiv oder inaktiv", () => {
    const mappe = baueMappe([
      zeile({ 0: "1001", 2: "Aktiv", 4: "A", 5: "A" }),
      zeile({ 0: "1002", 2: "Inaktiv", 4: "B", 5: "B" }),
    ]);
    const { zeilen } = lesePersonalblatt(mappe);
    expect(zeilen.map((z) => z.aktiv)).toEqual([true, false]);
  });

  test("ein unbekannter Status gilt als inaktiv und wird gemeldet", () => {
    const mappe = baueMappe([zeile({ 0: "1001", 2: "Urlaub", 4: "A", 5: "A" })]);
    const { zeilen, warnungen } = lesePersonalblatt(mappe);
    expect(zeilen[0]?.aktiv).toBe(false);
    expect(warnungen[0]).toMatch(/unbekannter Status/);
  });

  test("Strasse und Hausnummer werden zusammengezogen", () => {
    const mappe = baueMappe([
      zeile({ 0: "1001", 2: "Aktiv", 4: "A", 5: "A", 14: "Musterweg", 15: "12b" }),
    ]);
    expect(lesePersonalblatt(mappe).zeilen[0]?.strasse).toBe("Musterweg 12b");
  });

  test("ein leerer Ferienanspruch bleibt leer statt null Tage zu werden", () => {
    // Im echten Blatt ist die Spalte bei fast allen leer. Daraus 0 Tage
    // Anspruch zu machen waere schlimmer als nichts zu wissen.
    const mappe = baueMappe([zeile({ 0: "1001", 2: "Aktiv", 4: "A", 5: "A", 10: 0, 11: 0 })]);
    const [person] = lesePersonalblatt(mappe).zeilen;
    expect(person?.ferienanspruch).toBeNull();
    // Der Saldo darf dagegen echt 0 sein, das ist eine Aussage.
    expect(person?.ferienSaldo).toBe("0.00");
  });

  test("Zeilen ohne Namen werden uebersprungen und gemeldet", () => {
    const mappe = baueMappe([zeile({ 0: "1099", 2: "Inaktiv" })]);
    const { zeilen, warnungen } = lesePersonalblatt(mappe);
    expect(zeilen).toHaveLength(0);
    expect(warnungen[0]).toMatch(/keinen Namen/);
  });

  test("eine doppelte Personalnummer wird gemeldet, nicht still ueberschrieben", () => {
    const mappe = baueMappe([
      zeile({ 0: "1001", 2: "Aktiv", 4: "Erste", 5: "Person" }),
      zeile({ 0: "1001", 2: "Aktiv", 4: "Zweite", 5: "Person" }),
    ]);
    const { zeilen, warnungen } = lesePersonalblatt(mappe);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.name).toBe("Erste Person");
    expect(warnungen[0]).toMatch(/mehrfach/);
  });

  test("ein fehlendes Blatt ist kein Absturz", () => {
    const leer = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(leer, XLSX.utils.aoa_to_sheet([[]]), "Anderes");
    expect(lesePersonalblatt(leer).warnungen[0]).toMatch(/Kein Blatt/);
  });
});

describe("Excel-Datumswerte", () => {
  test("rechnet die Tageszahl in ein Datum um", () => {
    // Nachgerechnete Eckwerte, nicht aus dem Gedaechtnis:
    // Excel zaehlt ab dem 30.12.1899.
    expect(excelDatum(44927)).toBe("2023-01-01");
    expect(excelDatum(45000)).toBe("2023-03-15");
    expect(excelDatum(45292)).toBe("2024-01-01");
  });

  test("verschiebt sich nicht um einen Tag", () => {
    // Der klassische Fehler: ein Date wird in Ortszeit gelesen und der
    // Geburtstag rutscht auf den Vortag.
    expect(excelDatum(new Date(Date.UTC(1970, 4, 11)))).toBe("1970-05-11");
  });

  test("nimmt auch fertige Datumstexte", () => {
    expect(excelDatum("2026-02-01")).toBe("2026-02-01");
  });

  test("weist unplausible Jahre ab", () => {
    // Seriennummer 1 waere der 31.12.1899. In einer Spalte mit
    // Geburtstagen ist das ein Streuwert, kein Datum.
    expect(excelDatum(1)).toBeNull(); // waere der 31.12.1899
    expect(excelDatum(-5)).toBeNull();
    expect(excelDatum(9_000_000)).toBeNull(); // weit im Jahr 26'000

    // Die Grenze liegt beim Jahr 1900, nicht bei "plausibles Geburtsjahr".
    // Sie faengt Streuwerte ab, ersetzt aber keine Fachpruefung.
    expect(excelDatum(50)).toBe("1900-02-18");
  });

  test("liefert null statt Unsinn", () => {
    expect(excelDatum(null)).toBeNull();
    expect(excelDatum("")).toBeNull();
    expect(excelDatum(0)).toBeNull();
    expect(excelDatum("irgendwas")).toBeNull();
    expect(excelDatum(9_000_000)).toBeNull();
  });
});
