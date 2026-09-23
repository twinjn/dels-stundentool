/**
 * Tests für Mitarbeiter und Objekte.
 *
 * Schwerpunkt: was die Rolle "buero" NICHT sehen und NICHT ändern darf.
 * Ein Rechtesystem beweist man an dem, was es verweigert.
 */
import { eq, inArray, like } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import { benutzer, eintraege, mitarbeiter, objekte, protokoll, sitzungen } from "../db/schema.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("stamm");

const ADMIN_MAIL = `${marke}-admin@dels.ch`;
const BUERO_MAIL = `${marke}-buero@dels.ch`;

let adminId: string;
let bueroId: string;
let mitarbeiterId: string;
let objektId: string;

beforeAll(async () => {
  adminId = await benutzerAnlegen(`${marke} Admin`, ADMIN_MAIL, "admin");
  bueroId = await benutzerAnlegen(`${marke} Buero`, BUERO_MAIL, "buero");

  const [m] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Person`, monatslohn: "5200.50", stundenlohn: "31.25" })
    .returning({ id: mitarbeiter.id });
  mitarbeiterId = m!.id;

  const [o] = await db
    .insert(objekte)
    .values({ name: `${marke} Objekt`, aboBetrag: "1250.00" })
    .returning({ id: objekte.id });
  objektId = o!.id;
});

afterAll(async () => {
  await db.delete(protokoll).where(like(protokoll.benutzerName, `${marke}%`));
  await db.delete(eintraege).where(eq(eintraege.mitarbeiterId, mitarbeiterId));
  await db.delete(mitarbeiter).where(like(mitarbeiter.name, `${marke}%`));
  await db.delete(objekte).where(like(objekte.name, `${marke}%`));
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [adminId, bueroId]));
  await db.delete(benutzer).where(inArray(benutzer.id, [adminId, bueroId]));
  await datenbankSchliessen();
});

describe("Lohnfelder", () => {
  test("buero bekommt die Löhne gar nicht erst geschickt", async () => {
    const klient = await anmelden(app, BUERO_MAIL);
    const antwort = await klient.get(`/api/mitarbeiter/${mitarbeiterId}`);

    expect(antwort.status).toBe(200);
    expect(antwort.body.name).toContain(marke);
    // Nicht "ist ausgeblendet", sondern: steht nicht in der Antwort.
    expect(antwort.body).not.toHaveProperty("monatslohn");
    expect(antwort.body).not.toHaveProperty("stundenlohn");
    expect(JSON.stringify(antwort.body)).not.toContain("5200.50");
  });

  test("auch in der Liste tauchen sie für buero nicht auf", async () => {
    const klient = await anmelden(app, BUERO_MAIL);
    const antwort = await klient.get("/api/mitarbeiter");

    expect(antwort.status).toBe(200);
    expect(JSON.stringify(antwort.body)).not.toContain("5200.50");
  });

  test("admin sieht sie", async () => {
    const klient = await anmelden(app, ADMIN_MAIL);
    const antwort = await klient.get(`/api/mitarbeiter/${mitarbeiterId}`);

    expect(antwort.status).toBe(200);
    expect(antwort.body.monatslohn).toBe("5200.50");
  });

  test("buero darf keinen Lohn setzen und bekommt es gesagt", async () => {
    const klient = await anmelden(app, BUERO_MAIL);
    const antwort = await klient
      .patch(`/api/mitarbeiter/${mitarbeiterId}`)
      .send({ monatslohn: "99999.00" });

    expect(antwort.status).toBe(403);

    // Und der Wert ist wirklich unverändert.
    const [zeile] = await db
      .select({ lohn: mitarbeiter.monatslohn })
      .from(mitarbeiter)
      .where(eq(mitarbeiter.id, mitarbeiterId));
    expect(zeile?.lohn).toBe("5200.50");
  });
});

describe("Mitarbeiter anlegen und ändern", () => {
  test("buero darf Stammdaten pflegen", async () => {
    const klient = await anmelden(app, BUERO_MAIL);
    const antwort = await klient
      .post("/api/mitarbeiter")
      .send({ name: `${marke} Neu`, ort: "Basel", ferienanspruch: "27" });

    expect(antwort.status).toBe(201);
    expect(antwort.body.ort).toBe("Basel");
    expect(antwort.body.ferienanspruch).toBe("27.00");
  });

  test("eine IBAN mit Zahlendreher wird abgelehnt", async () => {
    const klient = await anmelden(app, ADMIN_MAIL);
    const antwort = await klient
      .post("/api/mitarbeiter")
      .send({ name: `${marke} Falsch`, iban: "CH93 0076 2011 6238 5297 5" });

    expect(antwort.status).toBe(400);
    expect(JSON.stringify(antwort.body)).toMatch(/IBAN/i);
  });

  test("leere Felder werden zu null statt zu leerem Text", async () => {
    const klient = await anmelden(app, ADMIN_MAIL);
    const antwort = await klient
      .post("/api/mitarbeiter")
      .send({ name: `${marke} Leer`, telefon: "", ort: "  " });

    expect(antwort.status).toBe(201);
    expect(antwort.body.telefon).toBeNull();
    expect(antwort.body.ort).toBeNull();
  });

  test("ohne Anmeldung geht gar nichts", async () => {
    expect((await request(app).get("/api/mitarbeiter")).status).toBe(401);
    expect((await request(app).post("/api/mitarbeiter").send({ name: "X" })).status).toBe(401);
  });
});

describe("Löschen", () => {
  test("ein Mitarbeiter mit Stunden lässt sich nicht löschen", async () => {
    await db.insert(eintraege).values({
      mitarbeiterId,
      objektId,
      datum: "2026-02-10",
      art: "arbeit",
      wert: "8.40",
    });

    const klient = await anmelden(app, ADMIN_MAIL);
    const antwort = await klient.delete(`/api/mitarbeiter/${mitarbeiterId}`);

    expect(antwort.status).toBe(409);
    expect(antwort.body.code).toBe("hat_daten");
    expect(antwort.body.nachricht).toMatch(/still/i);
  });

  test("ein Objekt mit gebuchten Stunden auch nicht", async () => {
    const klient = await anmelden(app, ADMIN_MAIL);
    const antwort = await klient.delete(`/api/objekte/${objektId}`);

    expect(antwort.status).toBe(409);
    expect(antwort.body.code).toBe("hat_daten");
  });

  test("ein frisch angelegtes Objekt ohne Daten lässt sich löschen", async () => {
    const klient = await anmelden(app, ADMIN_MAIL);
    const neu = await klient.post("/api/objekte").send({ name: `${marke} Wegwerf` });
    expect(neu.status).toBe(201);

    const weg = await klient.delete(`/api/objekte/${neu.body.id}`);
    expect(weg.status).toBe(204);
  });
});

describe("Protokoll", () => {
  test("jede Änderung wird mit Benutzer und altem Wert festgehalten", async () => {
    const klient = await anmelden(app, ADMIN_MAIL);
    await klient.patch(`/api/mitarbeiter/${mitarbeiterId}`).send({ ort: "Zuerich" });

    const eintragsliste = await db
      .select()
      .from(protokoll)
      .where(eq(protokoll.datensatzId, mitarbeiterId));

    const letzter = eintragsliste.at(-1);
    expect(letzter?.aktion).toBe("aendern");
    expect(letzter?.tabelle).toBe("mitarbeiter");
    expect(letzter?.benutzerName).toContain(marke);
    expect(letzter?.nachher).toMatchObject({ ort: "Zuerich" });
  });

  test("im Protokoll stehen nur die geänderten Felder, nicht der ganze Datensatz", async () => {
    const klient = await anmelden(app, ADMIN_MAIL);
    await klient.patch(`/api/objekte/${objektId}`).send({ kunde: "Neuer Kunde" });

    const [letzter] = await db.select().from(protokoll).where(eq(protokoll.datensatzId, objektId));

    expect(Object.keys(letzter?.nachher as object)).toEqual(["kunde"]);
  });
});
