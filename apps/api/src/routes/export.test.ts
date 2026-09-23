/**
 * Tests für den Export.
 *
 * Der Punkt dieser Tests ist NICHT, dass die Route 200 liefert. Eine
 * kaputte Arbeitsmappe liefert auch 200. Deshalb wird jede erzeugte
 * Datei hier wieder eingelesen und Zelle für Zelle mit dem verglichen,
 * was in der Datenbank steht.
 */
import { rechne } from "@dels/shared";
import { eq, inArray, like } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import {
  benutzer,
  eintraege,
  kalkAdminkosten,
  kalkMonat,
  kalkObjektMonat,
  kalkPersonMonat,
  mitarbeiter,
  objekte,
  protokoll,
  sitzungen,
} from "../db/schema.js";
import { excelDatum } from "../import/personal.js";
import { kalkulationsdaten } from "../kalkulation/daten.js";
import { alsExcelDatum } from "../export/arbeitsmappe.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("exp");
const ADMIN = `${marke}-admin@dels.ch`;
const BUERO = `${marke}-buero@dels.ch`;

const MONAT = "2033-04"; // weit weg von echten Daten
const KALKMONAT = "1999-07";

let adminId: string;
let bueroId: string;
let personId: string;
let objektId: string;

/** Liest die Antwort als Arbeitsmappe zurueck. */
function mappeAus(rumpf: Buffer): XLSX.WorkBook {
  return XLSX.read(rumpf, { type: "buffer" });
}

/** Ein Blatt als Feld von Feldern, damit sich Zellen adressieren lassen. */
function zeilenVon(mappe: XLSX.WorkBook, blattname: string): unknown[][] {
  const ws = mappe.Sheets[blattname];
  if (!ws) throw new Error(`Blatt "${blattname}" fehlt. Vorhanden: ${mappe.SheetNames.join(", ")}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

async function hole(klient: ReturnType<typeof request.agent>, pfad: string) {
  return klient.get(pfad).responseType("blob");
}

beforeAll(async () => {
  adminId = await benutzerAnlegen(`${marke} Admin`, ADMIN, "admin");
  bueroId = await benutzerAnlegen(`${marke} Buero`, BUERO, "buero");

  const [p] = await db
    .insert(mitarbeiter)
    .values({
      name: `${marke} Person`,
      personalnummer: `${marke}-P1`,
      stundenlohn: "27.50",
      eintrittsdatum: "2020-03-01",
      aktiv: true,
    })
    .returning({ id: mitarbeiter.id });
  personId = p!.id;

  const [o] = await db
    .insert(objekte)
    .values({ name: `${marke} Objekt`, objektNr: `${marke}-1`, aboBetrag: "1500.00", aktiv: true })
    .returning({ id: objekte.id });
  objektId = o!.id;

  await db.insert(eintraege).values([
    { mitarbeiterId: personId, objektId, datum: `${MONAT}-04`, art: "arbeit", wert: "8.40" },
    { mitarbeiterId: personId, objektId, datum: `${MONAT}-05`, art: "arbeit", wert: "4.25" },
    { mitarbeiterId: personId, objektId: null, datum: `${MONAT}-06`, art: "ferien", wert: "1.00" },
  ]);

  // Ein Kalkulationsmonat, damit der Export etwas zu rechnen hat.
  await db.insert(kalkMonat).values({ monat: `${KALKMONAT}-01` });
  await db
    .insert(kalkObjektMonat)
    .values({ monat: `${KALKMONAT}-01`, objektId, aboBetrag: "1500.00", aktiv: true });
  await db.insert(kalkPersonMonat).values({
    monat: `${KALKMONAT}-01`,
    mitarbeiterId: personId,
    lohn: "4200.00",
    spesen: "150.00",
  });
  await db
    .insert(kalkAdminkosten)
    .values({ monat: `${KALKMONAT}-01`, position: `${marke} Buero`, betrag: "800.00" });
});

afterAll(async () => {
  await db.delete(protokoll).where(inArray(protokoll.benutzerId, [adminId, bueroId]));
  await db.delete(eintraege).where(eq(eintraege.mitarbeiterId, personId));
  await db.delete(kalkAdminkosten).where(eq(kalkAdminkosten.monat, `${KALKMONAT}-01`));
  await db.delete(kalkObjektMonat).where(eq(kalkObjektMonat.monat, `${KALKMONAT}-01`));
  await db.delete(kalkPersonMonat).where(eq(kalkPersonMonat.monat, `${KALKMONAT}-01`));
  await db.delete(kalkMonat).where(eq(kalkMonat.monat, `${KALKMONAT}-01`));
  await db.delete(mitarbeiter).where(like(mitarbeiter.name, `${marke}%`));
  await db.delete(objekte).where(like(objekte.name, `${marke}%`));
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [adminId, bueroId]));
  await db.delete(benutzer).where(inArray(benutzer.id, [adminId, bueroId]));
  await datenbankSchliessen();
});

describe("Rechte", () => {
  test("ohne Anmeldung 401", async () => {
    expect((await request(app).get(`/api/export/stunden?monat=${MONAT}`)).status).toBe(401);
    expect((await request(app).get("/api/export/stammdaten")).status).toBe(401);
  });

  test("buero darf die Kalkulation nicht exportieren", async () => {
    const klient = await anmelden(app, BUERO);
    expect((await klient.get(`/api/export/kalkulation?monat=${KALKMONAT}`)).status).toBe(403);
  });

  test("buero bekommt Stammdaten ohne Lohnspalten, admin mit", async () => {
    const buero = await anmelden(app, BUERO);
    const ohne = zeilenVon(
      mappeAus((await hole(buero, "/api/export/stammdaten")).body),
      "Mitarbeiter",
    );
    expect(ohne[0]).not.toContain("Stundenlohn");
    expect(ohne[0]).not.toContain("Monatslohn");
    // Die Zeile ist trotzdem da, nur eben ohne den Lohn.
    expect(ohne.some((z) => z[1] === `${marke} Person`)).toBe(true);
    // Und der Betrag steht in KEINER Zelle der Datei.
    expect(ohne.flat().some((w) => w === 27.5)).toBe(false);

    const admin = await anmelden(app, ADMIN);
    const mit = zeilenVon(
      mappeAus((await hole(admin, "/api/export/stammdaten")).body),
      "Mitarbeiter",
    );
    const spalte = mit[0]!.indexOf("Stundenlohn");
    expect(spalte).toBeGreaterThan(-1);
    const zeile = mit.find((z) => z[1] === `${marke} Person`);
    expect(zeile?.[spalte]).toBe(27.5);
  });
});

describe("Stundenblatt", () => {
  test("liefert eine xlsx-Datei mit sprechendem Namen", async () => {
    const klient = await anmelden(app, BUERO);
    const antwort = await hole(klient, `/api/export/stunden?monat=${MONAT}`);

    expect(antwort.status).toBe(200);
    expect(antwort.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(antwort.headers["content-disposition"]).toBe(
      `attachment; filename="Stunden_${MONAT}.xlsx"`,
    );
    // Personendaten gehören in keinen Zwischenspeicher.
    expect(antwort.headers["cache-control"]).toBe("no-store");
  });

  test("Stunden stehen als Zahlen in den richtigen Tagesspalten", async () => {
    const klient = await anmelden(app, BUERO);
    const zeilen = zeilenVon(
      mappeAus((await hole(klient, `/api/export/stunden?monat=${MONAT}`)).body),
      `Stunden ${MONAT}`,
    );

    // Kopfzeile mit den Tagesnummern finden.
    const kopf = zeilen.findIndex((z) => z[3] === 1);
    expect(kopf).toBeGreaterThan(-1);
    const spalteVon = (tag: number): number => 3 + (tag - 1);

    const personenzeile = zeilen.findIndex((z) => z[1] === `${marke} Person`);
    expect(personenzeile).toBeGreaterThan(-1);

    // Ferien stehen auf der Personenzeile, als Kuerzel.
    expect(zeilen[personenzeile]![spalteVon(6)]).toBe("F");

    // Stunden stehen auf der Objektzeile darunter, als Zahl.
    const objektzeile = zeilen[personenzeile + 1]!;
    expect(objektzeile[2]).toBe(`${marke}-1 ${marke} Objekt`);
    expect(objektzeile[spalteVon(4)]).toBe(8.4);
    expect(objektzeile[spalteVon(5)]).toBe(4.25);
    expect(objektzeile[spalteVon(7)]).toBe(null);

    // Zeilensumme direkt hinter der letzten Tagesspalte.
    const summenspalte = 3 + 30; // April hat 30 Tage
    expect(objektzeile[summenspalte]).toBeCloseTo(12.65, 10);

    // Auf der Personenzeile die Monatssummen.
    expect(zeilen[personenzeile]![summenspalte]).toBeCloseTo(12.65, 10);
    expect(zeilen[personenzeile]![summenspalte + 1]).toBe(1); // Ferientage
  });

  test("ein Export wird protokolliert", async () => {
    const klient = await anmelden(app, ADMIN);
    await hole(klient, `/api/export/stunden?monat=${MONAT}`);

    // Bewusst nicht "der erste Export-Eintrag": derselbe Admin exportiert
    // in anderen Tests dieser Datei auch die Stammdaten, und in welcher
    // Reihenfolge Vitest die Tests fahren lässt, ist nicht unsere Sache.
    const alle = await db.select().from(protokoll).where(eq(protokoll.benutzerId, adminId));
    const eintrag = alle.find((z) => z.aktion === "exportieren" && z.tabelle === "eintraege");

    expect(eintrag).toBeDefined();
    expect(eintrag?.nachher).toMatchObject({ export: "stunden", monat: MONAT });
  });
});

describe("Kalkulation", () => {
  test("enthält dieselben Zahlen, die rechne() liefert", async () => {
    const klient = await anmelden(app, ADMIN);
    const mappe = mappeAus((await hole(klient, `/api/export/kalkulation?monat=${KALKMONAT}`)).body);

    expect(mappe.SheetNames).toEqual(["Zusammenfassung", "Objekte", "Personal", "Adminkosten"]);

    const daten = await kalkulationsdaten(`${KALKMONAT}-01`);
    const erwartet = rechne({
      monat: daten.monat,
      s: daten.ansaetze,
      objektMonat: daten.objektMonat,
      personMonat: daten.personMonat,
      adminkosten: daten.adminkosten,
      eintraege: daten.eintraege,
      mitarbeiter: daten.mitarbeiter,
    });

    const zusammen = zeilenVon(mappe, "Zusammenfassung");
    const wertVon = (bezeichnung: string): unknown =>
      zusammen.find((z) => z[0] === bezeichnung)?.[1];

    expect(wertVon("Abonnemente (Umsatz)")).toBeCloseTo(erwartet.t.abos!, 6);
    expect(wertVon("Betriebsergebnis")).toBeCloseTo(erwartet.res.ergebnis, 6);
    expect(wertVon("Administration")).toBeCloseTo(erwartet.t.admin!, 6);

    // Das Objektblatt muss dieselbe Zeile zeigen.
    const objekte = zeilenVon(mappe, "Objekte");
    const zeile = objekte.find((z) => z[0] === `${marke}-1`);
    expect(zeile).toBeDefined();
    const meins = erwartet.obj.find((r) => r.o.objektId === objektId)!;
    expect(zeile![3]).toBeCloseTo(meins.abo, 6);
    expect(zeile![20]).toBeCloseTo(meins.gew, 6);

    // Und das Personalblatt.
    const personal = zeilenVon(mappe, "Personal");
    const pzeile = personal.find((z) => z[0] === `${marke}-P1`);
    expect(pzeile).toBeDefined();
    const meine = erwartet.staff.find((r) => r.p.mitarbeiterId === personId)!;
    expect(pzeile![13]).toBeCloseTo(meine.lohnSz, 6);
  });

  test("Anzahlen sind ganze Zahlen, die Marge ist ein Prozentwert", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await hole(klient, `/api/export/kalkulation?monat=${KALKMONAT}`);
    const ws = XLSX.read(antwort.body, { type: "buffer", cellStyles: true }).Sheets[
      "Zusammenfassung"
    ]!;
    const zeilen = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];

    const formatVon = (bezeichnung: string): string | undefined => {
      const nr = zeilen.findIndex((z) => z[0] === bezeichnung);
      return (ws[`B${nr + 1}`] as { z?: string } | undefined)?.z;
    };

    expect(formatVon("Marge")).toBe("0.00%");
    expect(formatVon("Objekte ohne Stunden")).toBe("#,##0");
    expect(formatVon("Abonnemente (Umsatz)")).toBe("#,##0.00");
    // Ein Satz aus dem Ansätze-Block, der weiter unten steht.
    expect(formatVon("AHV")).toBe("#,##0.00");
  });

  test("ein Monat ohne Kalkulation gibt 404, keine leere Datei", async () => {
    const klient = await anmelden(app, ADMIN);
    expect((await klient.get("/api/export/kalkulation?monat=1999-11")).status).toBe(404);
  });
});

describe("Datumswerte", () => {
  test("gehen durch Excel und wieder zurück, ohne einen Tag zu verlieren", () => {
    for (const iso of ["1900-01-01", "1999-12-31", "2020-03-01", "2026-02-28", "2099-06-15"]) {
      const serie = alsExcelDatum(iso)!;
      expect(excelDatum(serie)).toBe(iso);
    }
  });

  test("leere und unsinnige Werte bleiben leer", () => {
    expect(alsExcelDatum(null)).toBe(null);
    expect(alsExcelDatum("")).toBe(null);
    expect(alsExcelDatum("irgendwas")).toBe(null);
  });

  test("Datumsspalten kommen als echtes Datum in der Datei an", async () => {
    const klient = await anmelden(app, ADMIN);
    const zeilen = zeilenVon(
      mappeAus((await hole(klient, "/api/export/stammdaten")).body),
      "Mitarbeiter",
    );
    const spalte = zeilen[0]!.indexOf("Eintritt");
    const zeile = zeilen.find((z) => z[1] === `${marke} Person`)!;
    expect(excelDatum(zeile[spalte] as number)).toBe("2020-03-01");
  });
});
