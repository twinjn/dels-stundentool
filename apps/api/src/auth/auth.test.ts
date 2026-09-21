/**
 * Tests fuer Anmeldung und Rechte.
 *
 * Hier wird nicht geprueft, ob etwas "funktioniert", sondern ob es
 * zuverlaessig ABLEHNT. Ein Anmeldesystem, bei dem der richtige Benutzer
 * hereinkommt, ist trivial. Eines, bei dem alle anderen draussen bleiben,
 * ist die eigentliche Aufgabe.
 */
import { eq, inArray, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import { benutzer, sitzungen } from "../db/schema.js";
import { schutzZuruecksetzen } from "./anmeldeschutz.js";
import { hashePasswort } from "./passwort.js";

const app = baueApp();

const marke = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const ADMIN_MAIL = `${marke}-admin@dels.ch`;
const BUERO_MAIL = `${marke}-buero@dels.ch`;
const ADMIN2_MAIL = `${marke}-admin2@dels.ch`;
const PASSWORT = "ein-langes-testpasswort";

let adminId: string;
let buoroId: string;
let admin2Id: string;

/**
 * Admins, die vor dem Test schon aktiv waren. Fuer den Test zur
 * Letzter-Admin-Sperre muessen wir genau wissen, wie viele aktive Admins
 * es gibt. Deshalb legen wir fremde vorher still und stellen sie hinterher
 * wieder her.
 */
let fremdeAdmins: string[] = [];

async function legeAn(email: string, rolle: "admin" | "buero"): Promise<string> {
  const [zeile] = await db
    .insert(benutzer)
    .values({
      name: `${marke} ${rolle}`,
      email,
      rolle,
      passwortHash: await hashePasswort(PASSWORT),
    })
    .returning({ id: benutzer.id });
  if (!zeile) throw new Error("Testbenutzer konnte nicht angelegt werden.");
  return zeile.id;
}

/** Meldet sich an und liefert einen Klienten, der das Cookie behaelt. */
async function angemeldetAls(email: string) {
  const klient = request.agent(app);
  const antwort = await klient.post("/api/auth/anmelden").send({ email, passwort: PASSWORT });
  expect(antwort.status).toBe(200);
  return klient;
}

beforeAll(async () => {
  const vorhandene = await db
    .select({ id: benutzer.id })
    .from(benutzer)
    .where(sql`${benutzer.rolle} = 'admin' and ${benutzer.aktiv} = true`);
  fremdeAdmins = vorhandene.map((z) => z.id);
  if (fremdeAdmins.length > 0) {
    await db.update(benutzer).set({ aktiv: false }).where(inArray(benutzer.id, fremdeAdmins));
  }

  adminId = await legeAn(ADMIN_MAIL, "admin");
  buoroId = await legeAn(BUERO_MAIL, "buero");
  admin2Id = await legeAn(ADMIN2_MAIL, "admin");
});

afterAll(async () => {
  const meine = [adminId, buoroId, admin2Id].filter(Boolean);
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, meine));
  await db.delete(benutzer).where(inArray(benutzer.id, meine));
  if (fremdeAdmins.length > 0) {
    await db.update(benutzer).set({ aktiv: true }).where(inArray(benutzer.id, fremdeAdmins));
  }
  await datenbankSchliessen();
});

beforeEach(() => {
  // Sonst schleppt ein Test die Sperre des vorigen mit.
  schutzZuruecksetzen();
});

describe("Anmeldung", () => {
  test("ohne Cookie kommt man nicht an /api/auth/ich", async () => {
    const antwort = await request(app).get("/api/auth/ich");
    expect(antwort.status).toBe(401);
    expect(antwort.body.code).toBe("nicht_angemeldet");
  });

  test("falsches Passwort und unbekannte E-Mail geben dieselbe Meldung", async () => {
    // Sonst kann ein Angreifer herausfinden, welche Adressen ein Konto
    // haben, indem er den Unterschied in der Antwort auswertet.
    const falschesPasswort = await request(app)
      .post("/api/auth/anmelden")
      .send({ email: ADMIN_MAIL, passwort: "das-ist-voellig-falsch" });

    const unbekannteMail = await request(app)
      .post("/api/auth/anmelden")
      .send({ email: `${marke}-gibtsnicht@dels.ch`, passwort: "das-ist-voellig-falsch" });

    expect(falschesPasswort.status).toBe(401);
    expect(unbekannteMail.status).toBe(401);
    expect(falschesPasswort.body.nachricht).toBe(unbekannteMail.body.nachricht);
    expect(falschesPasswort.body.code).toBe(unbekannteMail.body.code);
  });

  test("erfolgreiche Anmeldung setzt ein Cookie, an das JavaScript nicht herankommt", async () => {
    const antwort = await request(app)
      .post("/api/auth/anmelden")
      .send({ email: ADMIN_MAIL, passwort: PASSWORT });

    expect(antwort.status).toBe(200);

    const cookies = antwort.headers["set-cookie"] as unknown as string[];
    const sitzungsCookie = cookies.find((c) => c.startsWith("dels_sitzung="));
    expect(sitzungsCookie).toBeDefined();
    expect(sitzungsCookie).toMatch(/HttpOnly/i);
    expect(sitzungsCookie).toMatch(/SameSite=Lax/i);
  });

  test("die Antwort enthaelt nirgends den Passwort-Hash", async () => {
    const antwort = await request(app)
      .post("/api/auth/anmelden")
      .send({ email: ADMIN_MAIL, passwort: PASSWORT });

    const alsText = JSON.stringify(antwort.body);
    expect(alsText).not.toMatch(/argon2/);
    expect(alsText).not.toMatch(/passwort/i);
  });

  test("in der Datenbank steht nicht das Sitzungs-Token, sondern nur sein Hash", async () => {
    const antwort = await request(app)
      .post("/api/auth/anmelden")
      .send({ email: BUERO_MAIL, passwort: PASSWORT });

    const cookies = antwort.headers["set-cookie"] as unknown as string[];
    const token = cookies
      .find((c) => c.startsWith("dels_sitzung="))
      ?.split(";")[0]
      ?.split("=")[1];
    expect(token).toBeTruthy();

    const [treffer] = await db
      .select({ id: sitzungen.id })
      .from(sitzungen)
      .where(eq(sitzungen.id, token!));
    expect(treffer).toBeUndefined();
  });

  test("mit gueltigem Cookie liefert /api/auth/ich den Benutzer", async () => {
    const klient = await angemeldetAls(ADMIN_MAIL);
    const antwort = await klient.get("/api/auth/ich");

    expect(antwort.status).toBe(200);
    expect(antwort.body.email).toBe(ADMIN_MAIL);
    expect(antwort.body.rolle).toBe("admin");
  });

  test("nach dem Abmelden ist die Sitzung wertlos", async () => {
    const klient = await angemeldetAls(ADMIN_MAIL);
    expect((await klient.get("/api/auth/ich")).status).toBe(200);

    expect((await klient.post("/api/auth/abmelden")).status).toBe(204);
    expect((await klient.get("/api/auth/ich")).status).toBe(401);
  });

  test("nach fuenf Fehlversuchen wird gesperrt", async () => {
    for (let i = 0; i < 5; i++) {
      const antwort = await request(app)
        .post("/api/auth/anmelden")
        .send({ email: ADMIN_MAIL, passwort: "falsch-falsch-falsch" });
      expect(antwort.status).toBe(401);
    }

    // Auch das RICHTIGE Passwort kommt jetzt nicht mehr durch.
    const gesperrt = await request(app)
      .post("/api/auth/anmelden")
      .send({ email: ADMIN_MAIL, passwort: PASSWORT });

    expect(gesperrt.status).toBe(429);
    expect(gesperrt.body.code).toBe("zu_viele_versuche");
  });
});

describe("Rechte", () => {
  test("buero kommt nicht an die Benutzerverwaltung", async () => {
    const klient = await angemeldetAls(BUERO_MAIL);
    const antwort = await klient.get("/api/benutzer");

    expect(antwort.status).toBe(403);
    expect(antwort.body.code).toBe("kein_zugriff");
  });

  test("buero kann auch keinen Benutzer anlegen", async () => {
    const klient = await angemeldetAls(BUERO_MAIL);
    const antwort = await klient.post("/api/benutzer").send({
      name: "Schmuggel",
      email: "schmuggel@dels.ch",
      passwort: "x".repeat(12),
      rolle: "admin",
    });

    expect(antwort.status).toBe(403);
  });

  test("ohne Anmeldung ist die Benutzerverwaltung 401, nicht 403", async () => {
    // Der Unterschied zaehlt: 401 heisst "melde dich an", 403 heisst
    // "du bist angemeldet, darfst aber nicht".
    const antwort = await request(app).get("/api/benutzer");
    expect(antwort.status).toBe(401);
  });

  test("admin sieht die Benutzerliste, aber ohne Passwort-Hashes", async () => {
    const klient = await angemeldetAls(ADMIN_MAIL);
    const antwort = await klient.get("/api/benutzer");

    expect(antwort.status).toBe(200);
    expect(Array.isArray(antwort.body)).toBe(true);
    expect(JSON.stringify(antwort.body)).not.toMatch(/argon2/);
  });
});

describe("Schutz vor dem Aussperren", () => {
  test("der letzte aktive Admin laesst sich nicht stilllegen", async () => {
    const klient = await angemeldetAls(ADMIN_MAIL);

    // Der zweite Admin darf weg, danach ist nur noch einer uebrig.
    const ersterVersuch = await klient.patch(`/api/benutzer/${admin2Id}`).send({ aktiv: false });
    expect(ersterVersuch.status).toBe(200);

    // Und der laesst sich jetzt nicht mehr stilllegen.
    const zweiterVersuch = await klient.patch(`/api/benutzer/${adminId}`).send({ aktiv: false });
    expect(zweiterVersuch.status).toBe(400);
    expect(zweiterVersuch.body.nachricht).toMatch(/letzte aktive Admin/i);

    // Auch nicht ueber den Umweg "mach mich zu buero".
    const dritterVersuch = await klient.patch(`/api/benutzer/${adminId}`).send({ rolle: "buero" });
    expect(dritterVersuch.status).toBe(400);

    // Wiederherstellen fuer die restlichen Tests.
    await db.update(benutzer).set({ aktiv: true }).where(eq(benutzer.id, admin2Id));
  });
});
