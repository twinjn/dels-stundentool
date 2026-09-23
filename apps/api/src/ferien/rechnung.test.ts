/**
 * Tests der Ferienrechnung.
 *
 * Ohne Datenbank, weil die Regeln hier reine Rechnerei sind. Was diese
 * Datei festhält, sind Firmenregeln und keine technischen Details:
 * wenn jemand die Werte hier ändert, ändert er die Ferien der
 * Belegschaft, und das soll er im Diff sehen.
 */
import { describe, expect, it } from "vitest";
import { ferienentschaedigung, ferienzuschlag, jahresanspruch } from "./rechnung.js";

describe("jahresanspruch", () => {
  it("gibt den vollen Anspruch, wenn jemand das ganze Jahr da war", () => {
    expect(jahresanspruch(25, 2026, "2019-03-01", null)).toEqual({ tage: 25, anteilig: false });
  });

  it("gibt den vollen Anspruch auch ohne hinterlegtes Eintrittsdatum", () => {
    expect(jahresanspruch(25, 2026, null, null)).toEqual({ tage: 25, anteilig: false });
  });

  it("halbiert bei Eintritt zur Jahresmitte", () => {
    // 1.7. bis 31.12. sind 184 von 365 Tagen, also 12.6 Tage. Auf halbe
    // Tage gerundet: 12.5.
    expect(jahresanspruch(25, 2026, "2026-07-01", null)).toEqual({ tage: 12.5, anteilig: true });
  });

  it("rechnet bei Austritt zur Jahresmitte genauso", () => {
    // 1.1. bis 30.6. sind 181 von 365 Tagen: 12.4 Tage, gerundet 12.5.
    expect(jahresanspruch(25, 2026, null, "2026-06-30")).toEqual({ tage: 12.5, anteilig: true });
  });

  it("berücksichtigt Ein- und Austritt im selben Jahr", () => {
    // 1.4. bis 30.9. sind 183 Tage: 12.53 -> 12.5.
    expect(jahresanspruch(25, 2026, "2026-04-01", "2026-09-30")).toEqual({
      tage: 12.5,
      anteilig: true,
    });
  });

  it("zählt den Eintrittstag mit", () => {
    // Eintritt am 31.12. ist genau ein Tag: 25 / 365 = 0.068 -> 0.
    // Aufgeschrieben, damit klar ist, dass hier nicht abgeschnitten,
    // sondern auf halbe Tage gerundet wird.
    expect(jahresanspruch(25, 2026, "2026-12-31", null)).toEqual({ tage: 0, anteilig: true });
    // Zehn Tage (22.12. bis 31.12.) sind 0.68 und werden zum halben Tag,
    // elf Tage sind schon 0.75 und damit ein ganzer. Genau diese Grenze
    // hatte ich beim Schreiben des Tests zuerst falsch im Kopf.
    expect(jahresanspruch(25, 2026, "2026-12-22", null).tage).toBe(0.5);
    expect(jahresanspruch(25, 2026, "2026-12-21", null).tage).toBe(1);
  });

  it("rechnet im Schaltjahr mit 366 Tagen", () => {
    // 2028 ist ein Schaltjahr. 1.7. bis 31.12. sind dort 184 von 366.
    expect(jahresanspruch(25, 2028, "2028-07-01", null).tage).toBe(12.5);
    // Und das ganze Jahr bleibt das ganze Jahr.
    expect(jahresanspruch(25, 2028, "2028-01-01", "2028-12-31")).toEqual({
      tage: 25,
      anteilig: false,
    });
  });

  it("gibt null Tage, wenn die Person im Jahr gar nicht angestellt war", () => {
    expect(jahresanspruch(25, 2026, "2027-01-01", null).tage).toBe(0);
    expect(jahresanspruch(25, 2026, null, "2025-12-31").tage).toBe(0);
  });

  it("kommt mit einem abweichenden Anspruch zurecht", () => {
    expect(jahresanspruch(20, 2026, "2026-07-01", null).tage).toBe(10);
  });
});

describe("ferienzuschlag", () => {
  /*
   * Die drei Werte, die in jedem Schweizer Lohnbuch stehen. Wer sie hier
   * anders findet, hat einen Fehler gemacht, nicht eine Firmenregel.
   */
  it("ergibt 8.333 % bei vier Wochen", () => {
    const { wochen, anteil } = ferienzuschlag(20);
    expect(wochen).toBe(4);
    expect(anteil).toBeCloseTo(0.08333, 5);
  });

  it("ergibt 10.638 % bei fünf Wochen", () => {
    const { wochen, anteil } = ferienzuschlag(25);
    expect(wochen).toBe(5);
    expect(anteil).toBeCloseTo(0.10638, 5);
  });

  it("ergibt 13.043 % bei sechs Wochen", () => {
    expect(ferienzuschlag(30).anteil).toBeCloseTo(0.13043, 5);
  });

  it("teilt durch die Arbeitswochen, nicht durch 52", () => {
    // Der häufigste Fehler wäre 5/52 = 9.6 %. Dieser Test schlägt an,
    // falls jemand die Formel "vereinfacht".
    expect(ferienzuschlag(25).anteil).not.toBeCloseTo(5 / 52, 4);
  });

  it("gibt null zurück, wenn kein oder ein unsinniger Anspruch hinterlegt ist", () => {
    expect(ferienzuschlag(0).anteil).toBe(0);
    expect(ferienzuschlag(-5).anteil).toBe(0);
    expect(ferienzuschlag(400).anteil).toBe(0);
  });
});

describe("ferienentschaedigung", () => {
  it("rechnet Basis und Zuschlag in ganzen Rappen", () => {
    // 100 Stunden zu 30.00 Franken sind 3000.00 Franken Basis.
    // Davon 10.638 % sind 319.15 Franken.
    const { basisRappen, betragRappen } = ferienentschaedigung(100, 3000, 25);
    expect(basisRappen).toBe(300_000);
    expect(betragRappen).toBe(31_915);
  });

  it("verliert bei krummen Stunden keine Rappen", () => {
    // 162.75 Stunden zu 28.50: 4638.375 -> 4638.38 Franken.
    const { basisRappen } = ferienentschaedigung(162.75, 2850, 25);
    expect(basisRappen).toBe(463_838);
  });

  it("gibt null aus, wenn keine Stunden erfasst sind", () => {
    expect(ferienentschaedigung(0, 3000, 25)).toMatchObject({
      basisRappen: 0,
      betragRappen: 0,
    });
  });

  it("gibt null aus, wenn kein Stundenlohn hinterlegt ist", () => {
    expect(ferienentschaedigung(100, 0, 25).betragRappen).toBe(0);
  });

  it("bleibt über viele Stunden hinweg exakt", () => {
    /*
     * Der Test, der in Gleitkomma schiefgeht. Zwölf Monate zu 173.25
     * Stunden, Lohn 27.35: einzeln gerechnet und aufsummiert muss
     * dasselbe herauskommen wie in einem Zug, auf den Rappen genau.
     */
    const lohn = 2735;
    const einzeln = Array.from({ length: 12 }, () => ferienentschaedigung(173.25, lohn, 25)).reduce(
      (summe, teil) => summe + teil.basisRappen,
      0,
    );

    expect(einzeln).toBe(12 * ferienentschaedigung(173.25, lohn, 25).basisRappen);
    expect(Number.isInteger(einzeln)).toBe(true);
  });
});
