/**
 * Tests für die Startseite.
 *
 * Der wichtigste Test ist der auf die Zeiträume: ohne den gleichen
 * Stichtag im Vormonat meldet die Seite am 2. jedes Monats einen
 * Einbruch von 90 Prozent, und dann glaubt ihr der Zahl zu Recht nicht
 * mehr.
 */
import { inArray, like } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import { benutzer, eintraege, mitarbeiter, objekte, sitzungen } from "../db/schema.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";
import { zeitraeume } from "./dashboard.js";

const app = baueApp();
const marke = markeErzeugen("dash");
const ADMIN = `${marke}-admin@dels.ch`;
const BUERO = `${marke}-buero@dels.ch`;

// Weit weg von echten Daten und von heute, damit der Monat nie "laufend" ist.
const MONAT = "2034-03";

let adminId: string;
let bueroId: string;
let personId: string;
let zweiteId: string;
let ohneLohnId: string;
let monatsId: string;
let objektId: string;

beforeAll(async () => {
  adminId = await benutzerAnlegen(`${marke} Admin`, ADMIN, "admin");
  bueroId = await benutzerAnlegen(`${marke} Buero`, BUERO, "buero");

  const [p] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Arbeitet`, stundenlohn: "30.00", ferienanspruch: "25" })
    .returning({ id: mitarbeiter.id });
  personId = p!.id;

  // Zweite Person: keine Stunden, kein Stundenlohn, zu viele Ferien.
  const [q] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Faellt auf`, lohnart: "monat", ferienanspruch: "2" })
    .returning({ id: mitarbeiter.id });
  zweiteId = q!.id;

  const [k] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Ohne Lohn`, lohnart: "stunde" })
    .returning({ id: mitarbeiter.id });
  ohneLohnId = k!.id;

  const [m] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Monatslohn`, lohnart: "monat", ferienanspruch: "25" })
    .returning({ id: mitarbeiter.id });
  monatsId = m!.id;

  const [o] = await db
    .insert(objekte)
    .values({ name: `${marke} Objekt`, objektNr: `${marke}-1` })
    .returning({ id: objekte.id });
  objektId = o!.id;

  await db.insert(eintraege).values([
    { mitarbeiterId: personId, objektId, datum: `${MONAT}-05`, art: "arbeit", wert: "8.00" },
    { mitarbeiterId: personId, objektId, datum: `${MONAT}-06`, art: "arbeit", wert: "4.50" },
    {
      mitarbeiterId: personId,
      objektId: null,
      datum: `${MONAT}-07`,
      art: "krankheit",
      wert: "1.00",
    },
    // Im Vormonat, für den Vergleich.
    { mitarbeiterId: personId, objektId, datum: "2034-02-05", art: "arbeit", wert: "10.00" },
    // Drei Ferientage bei zwei Tagen Anspruch.
    { mitarbeiterId: zweiteId, objektId: null, datum: `${MONAT}-11`, art: "ferien", wert: "3.00" },
  ]);
});

afterAll(async () => {
  await db
    .delete(eintraege)
    .where(inArray(eintraege.mitarbeiterId, [personId, zweiteId, monatsId, ohneLohnId]));
  await db.delete(mitarbeiter).where(like(mitarbeiter.name, `${marke}%`));
  await db.delete(objekte).where(like(objekte.name, `${marke}%`));
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [adminId, bueroId]));
  await db.delete(benutzer).where(inArray(benutzer.id, [adminId, bueroId]));
  await datenbankSchliessen();
});

describe("Zeiträume", () => {
  test("im laufenden Monat wird bis heute gerechnet, im Vormonat bis zum gleichen Tag", () => {
    const z = zeitraeume("2026-09", "2026-09-21");
    expect(z.laufend).toBe(true);
    expect(z.von).toBe("2026-09-01");
    expect(z.bis).toBe("2026-09-21");
    expect(z.vorVon).toBe("2026-08-01");
    expect(z.vorBis).toBe("2026-08-21");
  });

  test("ein vergangener Monat wird ganz gerechnet", () => {
    const z = zeitraeume("2026-06", "2026-09-21");
    expect(z.laufend).toBe(false);
    expect(z.bis).toBe("2026-06-30");
    expect(z.vorBis).toBe("2026-05-31");
  });

  test("Januar vergleicht mit dem Dezember des Vorjahres", () => {
    const z = zeitraeume("2026-01", "2026-09-21");
    expect(z.vorVon).toBe("2025-12-01");
    expect(z.vorBis).toBe("2025-12-31");
  });

  test("der 31. wird im Februar auf den letzten Tag gekürzt", () => {
    const z = zeitraeume("2026-03", "2026-03-31");
    expect(z.bis).toBe("2026-03-31");
    expect(z.vorBis).toBe("2026-02-28"); // nicht 2026-02-31
  });

  test("Schaltjahr: der Februar hat 29 Tage", () => {
    const z = zeitraeume("2024-03", "2024-03-30");
    expect(z.vorBis).toBe("2024-02-29");
  });
});

describe("Zahlen", () => {
  test("Stunden, Absenzen und Vormonat stimmen", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient.get(`/api/dashboard?monat=${MONAT}`);

    expect(antwort.status).toBe(200);
    expect(antwort.body.stunden.zeitraum).toBeCloseTo(12.5, 6);
    expect(antwort.body.stunden.vormonat).toBeCloseTo(10, 6);
    expect(antwort.body.absenzen.krankheit).toBeCloseTo(1, 6);
    expect(antwort.body.absenzen.ferien).toBeCloseTo(3, 6);
  });

  test("Top-Objekte zeigen das bebuchte Objekt mit seinen Stunden", async () => {
    const klient = await anmelden(app, ADMIN);
    const { body } = await klient.get(`/api/dashboard?monat=${MONAT}`);

    const meins = body.topObjekte.find((o: { objektNr: string }) => o.objektNr === `${marke}-1`);
    expect(meins).toBeDefined();
    expect(meins.stunden).toBeCloseTo(12.5, 6);
  });

  test("wer keine Stunden erfasst hat, steht in der offenen Liste", async () => {
    const klient = await anmelden(app, ADMIN);
    const { body } = await klient.get(`/api/dashboard?monat=${MONAT}`);

    const namen = body.offen.ohneErfassung.map((p: { name: string }) => p.name);
    expect(namen).toContain(`${marke} Faellt auf`);
    expect(namen).not.toContain(`${marke} Arbeitet`);
  });

  test("ein Ferienminus wird gemeldet, mit dem Rest als Zahl", async () => {
    const klient = await anmelden(app, ADMIN);
    const { body } = await klient.get(`/api/dashboard?monat=${MONAT}`);

    // Zwei Tage Anspruch, drei bezogen, kein Übertrag: minus einer.
    const treffer = body.offen.ferienMinus.find(
      (p: { name: string }) => p.name === `${marke} Faellt auf`,
    );
    expect(treffer).toBeDefined();
    expect(treffer.rest).toBe(-1);
  });

  test("wer im Plus ist, steht nicht im Ferienminus", async () => {
    const klient = await anmelden(app, ADMIN);
    const { body } = await klient.get(`/api/dashboard?monat=${MONAT}`);
    const namen = (body.offen.ferienMinus as { name: string }[]).map((p) => p.name);
    expect(namen).not.toContain(`${marke} Monatslohn`);
  });
});

describe("Rechte", () => {
  test("ohne Anmeldung 401", async () => {
    expect((await request(app).get("/api/dashboard")).status).toBe(401);
  });

  test("buero sieht die Zahlen, aber nicht die Liste ohne Stundenlohn", async () => {
    const buero = await anmelden(app, BUERO);
    const { body, status } = await buero.get(`/api/dashboard?monat=${MONAT}`);

    expect(status).toBe(200);
    expect(body.stunden.zeitraum).toBeCloseTo(12.5, 6);
    expect(body.offen.ohneStundenlohn).toBe(null);
  });

  test("admin sieht die Liste ohne Stundenlohn", async () => {
    const admin = await anmelden(app, ADMIN);
    const { body } = await admin.get(`/api/dashboard?monat=${MONAT}`);

    expect(Array.isArray(body.offen.ohneStundenlohn)).toBe(true);
    const namen = body.offen.ohneStundenlohn.map((p: { name: string }) => p.name);
    expect(namen).toContain(`${marke} Ohne Lohn`);
    // Hat einen Stundenlohn, gehört also nicht auf die Liste.
    expect(namen).not.toContain(`${marke} Arbeitet`);
    // Monatslohn: dort ist ein fehlender Stundenlohn kein Mangel,
    // sondern der Normalfall. Früher stand diese Gruppe fälschlich
    // mit drauf, weil gegen den Freitext "mitarbeiterstufe" geprüft
    // wurde und der bei den Testdaten leer war.
    expect(namen).not.toContain(`${marke} Monatslohn`);
  });
});

describe("Eingaben", () => {
  test("ein unsinniger Monat wird abgelehnt", async () => {
    const klient = await anmelden(app, ADMIN);
    expect((await klient.get("/api/dashboard?monat=2026-13")).status).toBe(400);
    expect((await klient.get("/api/dashboard?monat=quatsch")).status).toBe(400);
  });

  test("ohne Monat wird der laufende genommen", async () => {
    const klient = await anmelden(app, ADMIN);
    const { body, status } = await klient.get("/api/dashboard");
    expect(status).toBe(200);
    expect(body.monat).toBe(body.heute.slice(0, 7));
  });
});

describe("Erinnerung an offene Ferientage", () => {
  test("schweigt vor Oktober", async () => {
    const klient = await anmelden(app, ADMIN);
    // MONAT ist der Maerz. Im Frühling hat fast jeder fast alles offen,
    // eine Warnung wäre hier reines Rauschen.
    const { body } = await klient.get(`/api/dashboard?monat=${MONAT}`);
    expect(body.offen.ferienOffen).toBeNull();
  });

  test("listet ab Oktober, wer im Monatslohn noch Tage offen hat", async () => {
    const klient = await anmelden(app, ADMIN);
    const { body } = await klient.get(`/api/dashboard?monat=${MONAT.slice(0, 4)}-10`);

    const zeilen = body.offen.ferienOffen as { name: string; rest: number }[];
    expect(zeilen).not.toBeNull();

    // Monatslohn, 25 Tage Anspruch, nichts bezogen: 25 offen.
    expect(zeilen.find((z) => z.name === `${marke} Monatslohn`)?.rest).toBe(25);

    // Wer im Stundenlohn ist, gehört nicht auf diese Liste: dort sind
    // die Ferien mit jedem Lohn schon ausbezahlt.
    expect(zeilen.some((z) => z.name === `${marke} Arbeitet`)).toBe(false);
  });
});
