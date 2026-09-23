import { describe, expect, test } from "vitest";
import { deuteZelleneingabe, istFehler, zeigeZelle } from "./zelleneingabe.js";

/** Kurzschreibweise: Zelle einer Objektzeile. */
const objekt = (e: string) => deuteZelleneingabe(e, true);
/** Kurzschreibweise: Zelle der Personenzeile. */
const person = (e: string) => deuteZelleneingabe(e, false);

describe("Stunden eintippen", () => {
  test("einfache Zahl", () => {
    expect(objekt("8.4")).toEqual({ leeren: false, art: "arbeit", wert: "8.40" });
  });

  test("Schweizer Schreibweise mit Komma und Hochkomma", () => {
    expect(objekt("8,4")).toEqual({ leeren: false, art: "arbeit", wert: "8.40" });
    expect(objekt("1'2")).toEqual({ leeren: false, art: "arbeit", wert: "12.00" });
  });

  test("Zeitschreibweise 8:24 sind 8.4 Stunden", () => {
    expect(objekt("8:24")).toEqual({ leeren: false, art: "arbeit", wert: "8.40" });
    expect(objekt("7:30")).toEqual({ leeren: false, art: "arbeit", wert: "7.50" });
  });

  test("leere Eingabe und Null löschen den Eintrag", () => {
    expect(objekt("")).toEqual({ leeren: true });
    expect(objekt("   ")).toEqual({ leeren: true });
    expect(objekt("0")).toEqual({ leeren: true });
  });

  test("mehr als 24 Stunden am Tag wird abgelehnt", () => {
    const ergebnis = objekt("25");
    expect(istFehler(ergebnis)).toBe(true);
  });

  test("Unsinn wird abgelehnt, mit einer Erklärung", () => {
    const ergebnis = objekt("acht");
    expect(istFehler(ergebnis)).toBe(true);
    if (istFehler(ergebnis)) expect(ergebnis.fehler).toMatch(/Erlaubt sind/);
  });
});

describe("Kürzel", () => {
  test("F, K, U, S und FT gehören zur Person", () => {
    expect(person("F")).toEqual({ leeren: false, art: "ferien", wert: "1.00" });
    expect(person("k")).toEqual({ leeren: false, art: "krankheit", wert: "1.00" });
    expect(person("U")).toEqual({ leeren: false, art: "unfall", wert: "1.00" });
    expect(person("s")).toEqual({ leeren: false, art: "sonstiges", wert: "1.00" });
    expect(person("ft")).toEqual({ leeren: false, art: "feiertag", wert: "1.00" });
  });

  test("Fr und FF gehören zum Objekt", () => {
    expect(objekt("Fr")).toEqual({ leeren: false, art: "frei", wert: "1.00" });
    expect(objekt("FF")).toEqual({ leeren: false, art: "frei", wert: "1.00" });
  });

  test("Ferien auf einer Objektzeile werden abgelehnt", () => {
    // Genau diese Verwechslung hat im alten Excel den Ferienanspruch
    // verfaelscht. Lieber eine klare Fehlermeldung als eine stille
    // Umdeutung.
    const ergebnis = objekt("F");
    expect(istFehler(ergebnis)).toBe(true);
    if (istFehler(ergebnis)) expect(ergebnis.fehler).toMatch(/gehoert zur Person/);
  });

  test('"Frei" auf der Personenzeile wird abgelehnt', () => {
    const ergebnis = person("Fr");
    expect(istFehler(ergebnis)).toBe(true);
    if (istFehler(ergebnis)) expect(ergebnis.fehler).toMatch(/Objektzeile/);
  });

  test("Stunden auf der Personenzeile werden abgelehnt", () => {
    const ergebnis = person("8");
    expect(istFehler(ergebnis)).toBe(true);
    if (istFehler(ergebnis)) expect(ergebnis.fehler).toMatch(/Objektzeile/);
  });
});

describe("Anzeige", () => {
  test("Stunden ohne ueberfluessige Nullen", () => {
    expect(zeigeZelle("arbeit", "8.40")).toBe("8.4");
    expect(zeigeZelle("arbeit", "8.00")).toBe("8");
    expect(zeigeZelle("arbeit", "1.75")).toBe("1.75");
  });

  test("Abwesenheiten als Kürzel", () => {
    expect(zeigeZelle("ferien", "1.00")).toBe("F");
    expect(zeigeZelle("frei", "1.00")).toBe("Fr");
    expect(zeigeZelle("krankheit", "1.00")).toBe("K");
  });
});
