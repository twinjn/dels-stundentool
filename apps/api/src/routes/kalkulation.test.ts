/**
 * Tests fuer die Kalkulations-Routen.
 * Gerechnet wird hier nicht, das prueft der Vergleichstest in
 * @dels/shared. Hier geht es um Rechte, Monatsanlage und Vorlagen.
 */
import { eq, inArray, like } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import {
  benutzer,
  kalkAdminkosten,
  kalkMonat,
  kalkObjektMonat,
  kalkPersonMonat,
  objekte,
  sitzungen,
} from "../db/schema.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("kalk");
const ADMIN = `${marke}-admin@dels.ch`;
const BUERO = `${marke}-buero@dels.ch`;

/**
 * Bewusst 1999, nicht ein Jahr in der Zukunft.
 *
 * Der Test prueft unter anderem, was beim ALLERERSTEN Monat passiert,
 * und das haengt daran, dass es keinen frueheren gibt. Mit einem
 * Zukunftsjahr stimmte das nur in einer leeren Datenbank: sobald jemand
 * lokal einen echten Monat angelegt hatte, wurde der zur Vorlage und der
 * Test fiel um. Vor 1999 wird nie ein Monat liegen.
 */
const ERSTER = "1999-01-01";
const ZWEITER = "1999-02-01";

let adminId: string;
let bueroId: string;
let objektId: string;

beforeAll(async () => {
  adminId = await benutzerAnlegen(`${marke} Admin`, ADMIN, "admin");
  bueroId = await benutzerAnlegen(`${marke} Buero`, BUERO, "buero");

  const [o] = await db
    .insert(objekte)
    .values({ name: `${marke} Objekt`, objektNr: `${marke}-1`, aboBetrag: "1500.00", aktiv: true })
    .returning({ id: objekte.id });
  objektId = o!.id;
});

afterAll(async () => {
  for (const monat of [ERSTER, ZWEITER]) {
    await db.delete(kalkAdminkosten).where(eq(kalkAdminkosten.monat, monat));
    await db.delete(kalkObjektMonat).where(eq(kalkObjektMonat.monat, monat));
    await db.delete(kalkPersonMonat).where(eq(kalkPersonMonat.monat, monat));
    await db.delete(kalkMonat).where(eq(kalkMonat.monat, monat));
  }
  await db.delete(objekte).where(like(objekte.name, `${marke}%`));
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [adminId, bueroId]));
  await db.delete(benutzer).where(inArray(benutzer.id, [adminId, bueroId]));
  await datenbankSchliessen();
});

describe("Rechte", () => {
  test("buero kommt gar nicht an die Kalkulation", async () => {
    const klient = await anmelden(app, BUERO);
    expect((await klient.get("/api/kalkulation/monate")).status).toBe(403);
    expect((await klient.get(`/api/kalkulation/${ERSTER}`)).status).toBe(403);
    expect((await klient.post(`/api/kalkulation/${ERSTER}`)).status).toBe(403);
  });

  test("ohne Anmeldung 401, nicht 403", async () => {
    expect((await request(app).get("/api/kalkulation/monate")).status).toBe(401);
  });
});

describe("Monat anlegen", () => {
  test("ein unsinniger Monat wird abgelehnt", async () => {
    const klient = await anmelden(app, ADMIN);
    expect((await klient.get("/api/kalkulation/2033-13-01")).status).toBe(400);
    // Nur der erste Tag des Monats ist erlaubt.
    expect((await klient.get("/api/kalkulation/2033-01-15")).status).toBe(400);
  });

  test("ein noch nicht angelegter Monat gibt 404 mit klarer Meldung", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient.get(`/api/kalkulation/${ERSTER}`);
    expect(antwort.status).toBe(404);
    expect(antwort.body.nachricht).toMatch(/noch kein Monat/);
  });

  test("der erste Monat übernimmt die aktiven Objekte", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient.post(`/api/kalkulation/${ERSTER}`);

    expect(antwort.status).toBe(201);
    expect(antwort.body.vorlage).toBeNull();
    expect(antwort.body.objekte).toBeGreaterThan(0);

    const daten = await klient.get(`/api/kalkulation/${ERSTER}`);
    expect(daten.status).toBe(200);
    const meins = daten.body.objektMonat.find((o: { objektId: string }) => o.objektId === objektId);
    expect(meins).toBeDefined();
    expect(meins.aboBetrag).toBe("1500.00");
  });

  test("derselbe Monat zweimal gibt 409", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient.post(`/api/kalkulation/${ERSTER}`);
    expect(antwort.status).toBe(409);
    expect(antwort.body.code).toBe("schon_vorhanden");
  });

  test("die Ansätze stehen mit ihren Standardwerten da", async () => {
    const klient = await anmelden(app, ADMIN);
    const { body } = await klient.get(`/api/kalkulation/${ERSTER}`);
    // Die Saetze brauchen sechs Nachkommastellen, sonst wird aus
    // 1.4494 Prozent ein glattes Prozent.
    expect(body.ansaetze.bu).toBe("0.014494");
    expect(body.ansaetze.ahv).toBe("0.053000");
    expect(body.ansaetze.nbuTraegtAg).toBe(false);
  });
});

describe("Aendern", () => {
  test("Ansätze lassen sich ändern und bleiben genau", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient
      .patch(`/api/kalkulation/${ERSTER}`)
      .send({ bu: "0.015123", nbuTraegtAg: true, notiz: "Praemie angepasst" });

    expect(antwort.status).toBe(200);
    expect(antwort.body.bu).toBe("0.015123");
    expect(antwort.body.nbuTraegtAg).toBe(true);
  });

  test("eine Objektzeile lässt sich ändern", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient
      .patch(`/api/kalkulation/${ERSTER}/objekt/${objektId}`)
      .send({ aboBetrag: "1750.50", aktiv: false });

    expect(antwort.status).toBe(200);
    expect(antwort.body.aboBetrag).toBe("1750.50");
    expect(antwort.body.aktiv).toBe(false);
  });

  test("eine Objektzeile, die es im Monat nicht gibt, gibt 404", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient
      .patch(`/api/kalkulation/${ERSTER}/objekt/11111111-1111-4111-8111-111111111111`)
      .send({ aktiv: true });
    expect(antwort.status).toBe(404);
  });
});

describe("Adminkosten", () => {
  test("anlegen, ändern, löschen", async () => {
    const klient = await anmelden(app, ADMIN);

    const neu = await klient
      .post(`/api/kalkulation/${ERSTER}/adminkosten`)
      .send({ position: "Buchhaltung", betrag: 480 });
    expect(neu.status).toBe(201);
    expect(neu.body.betrag).toBe("480.00");

    const geaendert = await klient
      .patch(`/api/kalkulation/${ERSTER}/adminkosten/${neu.body.id}`)
      .send({ betrag: "510.25" });
    expect(geaendert.body.betrag).toBe("510.25");

    expect(
      (await klient.delete(`/api/kalkulation/${ERSTER}/adminkosten/${neu.body.id}`)).status,
    ).toBe(204);
    expect(
      (await klient.delete(`/api/kalkulation/${ERSTER}/adminkosten/${neu.body.id}`)).status,
    ).toBe(404);
  });

  test("ein Posten ohne Bezeichnung wird abgelehnt", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient
      .post(`/api/kalkulation/${ERSTER}/adminkosten`)
      .send({ position: "  ", betrag: 100 });
    expect(antwort.status).toBe(400);
  });
});

describe("Folgemonat", () => {
  test("übernimmt Ansätze, Objektzeilen und Adminposten des Vormonats", async () => {
    const klient = await anmelden(app, ADMIN);

    await klient
      .post(`/api/kalkulation/${ERSTER}/adminkosten`)
      .send({ position: "Miete", betrag: 1200 });

    const angelegt = await klient.post(`/api/kalkulation/${ZWEITER}`);
    expect(angelegt.status).toBe(201);
    expect(angelegt.body.vorlage).toBe(ERSTER);

    const { body } = await klient.get(`/api/kalkulation/${ZWEITER}`);
    // Der geaenderte Satz aus dem Vormonat ist mitgekommen.
    expect(body.ansaetze.bu).toBe("0.015123");
    expect(body.ansaetze.nbuTraegtAg).toBe(true);
    // Und die Objektzeile inklusive ihres angepassten Abos.
    const meins = body.objektMonat.find((o: { objektId: string }) => o.objektId === objektId);
    expect(meins.aboBetrag).toBe("1750.50");
    expect(meins.aktiv).toBe(false);
    expect(body.adminkosten.some((a: { position: string }) => a.position === "Miete")).toBe(true);
  });

  test("die Monatsliste zeigt beide, neuester zuerst", async () => {
    const klient = await anmelden(app, ADMIN);
    const { body } = await klient.get("/api/kalkulation/monate");
    const meine = body.filter((m: { monat: string }) => [ERSTER, ZWEITER].includes(m.monat));
    expect(meine.map((m: { monat: string }) => m.monat)).toEqual([ZWEITER, ERSTER]);
  });
});
