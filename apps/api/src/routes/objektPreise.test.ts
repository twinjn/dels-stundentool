/**
 * Tests für die Preis-Historie der Objekte.
 *
 * Der Kern ist: objekt_abo ist die Wahrheit, objekte.abo_betrag nur
 * deren heutige Anzeige. Wenn diese beiden auseinanderlaufen, rechnet
 * irgendwann ein Monat mit einem Preis, den es so nie gab. Genau das
 * prüfen die Tests hier.
 */
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import { benutzer, objekte, objektAbo, protokoll, sitzungen } from "../db/schema.js";
import { heute } from "../objekte/preise.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("preise");
const ADMIN = `${marke}-admin@dels.ch`;
const BUERO = `${marke}-buero@dels.ch`;

let adminId: string;
let bueroId: string;
let objektId: string;

beforeAll(async () => {
  adminId = await benutzerAnlegen(`${marke} Admin`, ADMIN, "admin");
  bueroId = await benutzerAnlegen(`${marke} Buero`, BUERO, "buero");
});

afterAll(async () => {
  await db.delete(objektAbo).where(eq(objektAbo.objektId, objektId));
  await db.delete(objekte).where(like(objekte.name, `${marke}%`));
  await db.delete(protokoll).where(inArray(protokoll.benutzerId, [adminId, bueroId]));
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [adminId, bueroId]));
  await db.delete(benutzer).where(inArray(benutzer.id, [adminId, bueroId]));
  await datenbankSchliessen();
});

describe("Preis-Historie", () => {
  test("ein neu angelegtes Objekt bekommt sofort einen Preiseintrag", async () => {
    const klient = await anmelden(app, ADMIN);
    const neu = await klient
      .post("/api/objekte")
      .send({ name: `${marke} Objekt`, objektNr: `${marke}-1`, aboBetrag: "800.00" });
    expect(neu.status).toBe(201);
    objektId = neu.body.id;

    const verlauf = await klient.get(`/api/objekte/${objektId}/preise`);
    expect(verlauf.status).toBe(200);
    expect(verlauf.body).toHaveLength(1);
    expect(verlauf.body[0].betrag).toBe("800.00");
    expect(verlauf.body[0].gueltigAb).toBe(heute());
  });

  test("eine Änderung am Stammblatt landet in der Historie", async () => {
    const klient = await anmelden(app, ADMIN);
    const geaendert = await klient.patch(`/api/objekte/${objektId}`).send({ aboBetrag: "850.00" });
    expect(geaendert.status).toBe(200);
    expect(geaendert.body.aboBetrag).toBe("850.00");

    const verlauf = await klient.get(`/api/objekte/${objektId}/preise`);
    // Immer noch ein Eintrag: derselbe Tag, also derselbe Eintrag,
    // nur mit neuem Betrag. Zwei Preise am selben Tag wären nicht
    // auflösbar.
    expect(verlauf.body).toHaveLength(1);
    expect(verlauf.body[0].betrag).toBe("850.00");
  });

  test("ein Preis in der Zukunft ändert das Stammblatt noch nicht", async () => {
    const klient = await anmelden(app, ADMIN);
    const morgen = "2099-01-01";

    const gesetzt = await klient
      .post(`/api/objekte/${objektId}/preise`)
      .send({ gueltigAb: morgen, betrag: 1000, bemerkung: "Ab 2099." });
    expect(gesetzt.status).toBe(201);

    const objekt = await klient.get(`/api/objekte/${objektId}`);
    expect(objekt.body.aboBetrag).toBe("850.00");

    const verlauf = await klient.get(`/api/objekte/${objektId}/preise`);
    expect(verlauf.body).toHaveLength(2);
    // Jüngster zuoberst.
    expect(verlauf.body[0].gueltigAb).toBe(morgen);
  });

  test("ein Preis in der Vergangenheit greift sofort", async () => {
    const klient = await anmelden(app, ADMIN);
    const gesetzt = await klient
      .post(`/api/objekte/${objektId}/preise`)
      .send({ gueltigAb: "1990-01-01", betrag: 100 });
    expect(gesetzt.status).toBe(201);

    // Der heute gültige Preis bleibt der von heute, nicht der von 1990.
    expect((await klient.get(`/api/objekte/${objektId}`)).body.aboBetrag).toBe("850.00");

    // Wird der heutige gelöscht, fällt das Stammblatt auf 1990 zurück.
    const verlauf = await klient.get(`/api/objekte/${objektId}/preise`);
    const heutiger = verlauf.body.find((p: { gueltigAb: string }) => p.gueltigAb === heute());
    expect((await klient.delete(`/api/objekte/${objektId}/preise/${heutiger.id}`)).status).toBe(
      204,
    );
    expect((await klient.get(`/api/objekte/${objektId}`)).body.aboBetrag).toBe("100.00");
  });

  test("ein negativer Betrag wird abgelehnt", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient
      .post(`/api/objekte/${objektId}/preise`)
      .send({ gueltigAb: "2000-01-01", betrag: -5 });
    expect(antwort.status).toBe(422);
  });

  test("ein unbrauchbares Datum wird abgelehnt", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient
      .post(`/api/objekte/${objektId}/preise`)
      .send({ gueltigAb: "01.01.2000", betrag: 100 });
    expect(antwort.status).toBe(400);
  });

  /**
   * Bewusst so, nicht vergessen: das Büro darf Objektpreise pflegen.
   *
   * Der Abo-Betrag ist ein Kundenpreis, kein Lohn. Das Büro konnte ihn
   * schon vorher am Stammblatt ändern; die Historie gibt ihm keine
   * neue Befugnis, sie macht nur nachvollziehbar, wer wann was
   * geändert hat. Was dem Büro verschlossen bleibt, ist die
   * Kalkulation, also was am Ende daran verdient wird.
   */
  test("buero darf Preise pflegen, so wie schon das Stammblatt", async () => {
    const klient = await anmelden(app, BUERO);
    expect((await klient.get(`/api/objekte/${objektId}/preise`)).status).toBe(200);

    const gesetzt = await klient
      .post(`/api/objekte/${objektId}/preise`)
      .send({ gueltigAb: "2001-01-01", betrag: 100 });
    expect(gesetzt.status).toBe(201);
    expect(gesetzt.body.erfasstVon).toBe(`${marke} Buero`);

    // An die Kalkulation kommt es weiterhin nicht.
    expect((await klient.get("/api/kalkulation/monate")).status).toBe(403);

    await klient.delete(`/api/objekte/${objektId}/preise/${gesetzt.body.id}`);
  });

  test("ein Preiseintrag eines fremden Objekts lässt sich nicht löschen", async () => {
    const klient = await anmelden(app, ADMIN);
    const fremd = "00000000-0000-0000-0000-000000000000";
    const verlauf = await klient.get(`/api/objekte/${objektId}/preise`);
    const eintrag = verlauf.body[0];
    expect((await klient.delete(`/api/objekte/${fremd}/preise/${eintrag.id}`)).status).toBe(404);
    // Und er ist noch da.
    expect((await klient.get(`/api/objekte/${objektId}/preise`)).body).toHaveLength(
      verlauf.body.length,
    );
  });
});
