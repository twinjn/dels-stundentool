import { describe, expect, test } from "vitest";
import {
  MitarbeiterAnlegenSchema,
  ObjektAnlegenSchema,
  ahvFormatieren,
  ahvGueltig,
  ibanFormatieren,
  ibanGueltig,
} from "./stammdaten.js";

describe("IBAN", () => {
  test("erkennt gueltige Schweizer IBAN", () => {
    expect(ibanGueltig("CH93 0076 2011 6238 5295 7")).toBe(true);
    expect(ibanGueltig("CH9300762011623852957")).toBe(true);
    expect(ibanGueltig("ch9300762011623852957")).toBe(true);
  });

  test("erkennt einen Zahlendreher", () => {
    // Genau dafuer gibt es die Pruefsumme: zwei vertauschte Ziffern.
    expect(ibanGueltig("CH93 0076 2011 6238 5297 5")).toBe(false);
  });

  test("lehnt Unsinn ab", () => {
    expect(ibanGueltig("")).toBe(false);
    expect(ibanGueltig("CH00")).toBe(false);
    expect(ibanGueltig("12345678901234567890")).toBe(false);
  });

  test("formatiert in Vierergruppen", () => {
    expect(ibanFormatieren("CH9300762011623852957")).toBe("CH93 0076 2011 6238 5295 7");
  });
});

describe("AHV-Nummer", () => {
  test("erkennt eine gueltige Nummer", () => {
    expect(ahvGueltig("756.1234.5678.97")).toBe(true);
    expect(ahvGueltig("7561234567897")).toBe(true);
  });

  test("erkennt eine falsche Pruefziffer", () => {
    expect(ahvGueltig("756.1234.5678.98")).toBe(false);
  });

  test("verlangt den Laendercode 756", () => {
    expect(ahvGueltig("123.4567.8901.12")).toBe(false);
  });

  test("formatiert mit Punkten", () => {
    expect(ahvFormatieren("7561234567897")).toBe("756.1234.5678.97");
  });
});

describe("Mitarbeiter-Schema", () => {
  test("Zahlen bleiben Zeichenketten und verlieren keine Rappen", () => {
    const geprueft = MitarbeiterAnlegenSchema.parse({ name: "Anna", monatslohn: "5200.55" });
    expect(geprueft.monatslohn).toBe("5200.55");
    expect(typeof geprueft.monatslohn).toBe("string");
  });

  test("Schweizer Schreibweise mit Komma und Hochkomma wird verstanden", () => {
    const geprueft = MitarbeiterAnlegenSchema.parse({ name: "Anna", monatslohn: "5'200,55" });
    expect(geprueft.monatslohn).toBe("5200.55");
  });

  test("leere Felder werden zu null, nicht zu leerem Text", () => {
    const geprueft = MitarbeiterAnlegenSchema.parse({ name: "Anna", telefon: "", ort: "   " });
    expect(geprueft.telefon).toBeNull();
    expect(geprueft.ort).toBeNull();
  });

  test("der 31. Februar wird abgelehnt", () => {
    // JavaScript rechnet so ein Datum sonst still in den 3. Maerz um.
    const ergebnis = MitarbeiterAnlegenSchema.safeParse({
      name: "Anna",
      eintrittsdatum: "2026-02-31",
    });
    expect(ergebnis.success).toBe(false);
  });

  test("Austritt vor Eintritt wird abgelehnt", () => {
    const ergebnis = MitarbeiterAnlegenSchema.safeParse({
      name: "Anna",
      eintrittsdatum: "2026-05-01",
      austrittsdatum: "2026-04-30",
    });
    expect(ergebnis.success).toBe(false);
  });

  test("zu viele Nachkommastellen beim Lohn werden abgelehnt", () => {
    const ergebnis = MitarbeiterAnlegenSchema.safeParse({ name: "Anna", monatslohn: "5200.555" });
    expect(ergebnis.success).toBe(false);
  });

  test("ohne Namen geht nichts", () => {
    expect(MitarbeiterAnlegenSchema.safeParse({ name: "  " }).success).toBe(false);
  });
});

describe("Objekt-Schema", () => {
  test("Name genuegt", () => {
    const geprueft = ObjektAnlegenSchema.parse({ name: "Musterstrasse 1" });
    expect(geprueft.name).toBe("Musterstrasse 1");
  });

  test("Abo-Betrag mit Komma wird umgewandelt", () => {
    expect(ObjektAnlegenSchema.parse({ name: "X", aboBetrag: "1250,50" }).aboBetrag).toBe(
      "1250.50",
    );
  });
});
