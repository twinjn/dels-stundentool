/**
 * Tests für die beiden Passwortwege.
 *
 * Beide gab es schon, aber ungetestet und in der Oberfläche nicht
 * erreichbar. Mit den Knöpfen kommen deshalb die Tests.
 *
 * Der Punkt, auf den es ankommt: nach einer Änderung müssen ALLE
 * Sitzungen weg sein. Wer sein Passwort ändert, tut das oft genau
 * deshalb, weil vielleicht noch jemand anders angemeldet ist. Bliebe
 * dessen Sitzung gültig, wäre die Änderung wertlos.
 */
import { eq, inArray, like } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import { benutzer, sitzungen } from "../db/schema.js";
import { TESTPASSWORT, anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("pw");
const ADMIN = `${marke}-admin@dels.ch`;
const BUERO = `${marke}-buero@dels.ch`;
const NEUES = "ein-neues-langes-passwort";

let adminId: string;
let bueroId: string;

// Vor JEDEM Test frisch: die Tests ändern Passwörter, und ein Test
// darf nicht davon abhängen, welcher vorher lief.
beforeEach(async () => {
  await db
    .delete(sitzungen)
    .where(inArray(sitzungen.benutzerId, [adminId, bueroId].filter(Boolean)));
  await db.delete(benutzer).where(like(benutzer.email, `${marke}%`));
  adminId = await benutzerAnlegen(`${marke} Admin`, ADMIN, "admin");
  bueroId = await benutzerAnlegen(`${marke} Buero`, BUERO, "buero");
});

afterAll(async () => {
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [adminId, bueroId]));
  await db.delete(benutzer).where(like(benutzer.email, `${marke}%`));
  await datenbankSchliessen();
});

describe("Eigenes Passwort ändern", () => {
  test("mit richtigem altem Passwort, danach gilt nur noch das neue", async () => {
    const klient = await anmelden(app, BUERO);

    const antwort = await klient
      .post("/api/auth/passwort")
      .send({ altesPasswort: TESTPASSWORT, neuesPasswort: NEUES });
    expect(antwort.status).toBe(204);

    // Das alte Passwort zieht nicht mehr.
    const alt = await request(app)
      .post("/api/auth/anmelden")
      .send({ email: BUERO, passwort: TESTPASSWORT });
    expect(alt.status).toBe(401);

    // Das neue schon.
    const neu = await request(app)
      .post("/api/auth/anmelden")
      .send({ email: BUERO, passwort: NEUES });
    expect(neu.status).toBe(200);
  });

  test("ALLE Sitzungen werden beendet, auch die eigene", async () => {
    // Zwei Geräte, dieselbe Person.
    const geraetA = await anmelden(app, BUERO);
    const geraetB = await anmelden(app, BUERO);
    expect((await geraetB.get("/api/auth/ich")).status).toBe(200);

    await geraetA
      .post("/api/auth/passwort")
      .send({ altesPasswort: TESTPASSWORT, neuesPasswort: NEUES });

    // Das zweite Gerät ist damit ebenfalls draussen.
    expect((await geraetB.get("/api/auth/ich")).status).toBe(401);
    expect((await geraetA.get("/api/auth/ich")).status).toBe(401);

    const offen = await db.select().from(sitzungen).where(eq(sitzungen.benutzerId, bueroId));
    expect(offen).toHaveLength(0);
  });

  test("mit falschem altem Passwort passiert nichts", async () => {
    const klient = await anmelden(app, BUERO);

    const antwort = await klient
      .post("/api/auth/passwort")
      .send({ altesPasswort: "das-ist-nicht-das-richtige", neuesPasswort: NEUES });
    expect(antwort.status).toBe(400);

    // Das alte Passwort gilt weiterhin, das neue nicht.
    expect(
      (await request(app).post("/api/auth/anmelden").send({ email: BUERO, passwort: TESTPASSWORT }))
        .status,
    ).toBe(200);
    expect(
      (await request(app).post("/api/auth/anmelden").send({ email: BUERO, passwort: NEUES }))
        .status,
    ).toBe(401);
  });

  test("ein zu kurzes neues Passwort wird abgelehnt", async () => {
    const klient = await anmelden(app, BUERO);
    const antwort = await klient
      .post("/api/auth/passwort")
      .send({ altesPasswort: TESTPASSWORT, neuesPasswort: "kurz" });
    expect(antwort.status).toBe(400);
  });

  test("ohne Anmeldung 401", async () => {
    const antwort = await request(app)
      .post("/api/auth/passwort")
      .send({ altesPasswort: TESTPASSWORT, neuesPasswort: NEUES });
    expect(antwort.status).toBe(401);
  });
});

describe("Admin setzt ein Passwort zurück", () => {
  test("der Betroffene kann sich danach mit dem neuen anmelden", async () => {
    const admin = await anmelden(app, ADMIN);

    const antwort = await admin.post(`/api/benutzer/${bueroId}/passwort`).send({ passwort: NEUES });
    expect(antwort.status).toBe(204);

    expect(
      (await request(app).post("/api/auth/anmelden").send({ email: BUERO, passwort: NEUES }))
        .status,
    ).toBe(200);
  });

  test("die laufenden Sitzungen des Betroffenen sind weg", async () => {
    const buero = await anmelden(app, BUERO);
    expect((await buero.get("/api/auth/ich")).status).toBe(200);

    const admin = await anmelden(app, ADMIN);
    await admin.post(`/api/benutzer/${bueroId}/passwort`).send({ passwort: NEUES });

    expect((await buero.get("/api/auth/ich")).status).toBe(401);
    // Der Admin selbst bleibt angemeldet.
    expect((await admin.get("/api/auth/ich")).status).toBe(200);
  });

  test("buero darf das NICHT", async () => {
    const buero = await anmelden(app, BUERO);
    const antwort = await buero.post(`/api/benutzer/${adminId}/passwort`).send({ passwort: NEUES });
    expect(antwort.status).toBe(403);

    // Und das Passwort des Admins ist unverändert.
    expect(
      (await request(app).post("/api/auth/anmelden").send({ email: ADMIN, passwort: TESTPASSWORT }))
        .status,
    ).toBe(200);
  });

  test("ein zu kurzes Passwort wird abgelehnt", async () => {
    const admin = await anmelden(app, ADMIN);
    const antwort = await admin
      .post(`/api/benutzer/${bueroId}/passwort`)
      .send({ passwort: "kurz" });
    expect(antwort.status).toBe(400);
  });

  test("ein unbekannter Benutzer gibt 404", async () => {
    const admin = await anmelden(app, ADMIN);
    const antwort = await admin
      .post("/api/benutzer/11111111-1111-4111-8111-111111111111/passwort")
      .send({ passwort: NEUES });
    expect(antwort.status).toBe(404);
  });
});
