/**
 * Tests fuer das Protokoll.
 * Schwerpunkt: es ist admin-Sache, und es laesst sich nicht veraendern.
 */
import { inArray, like } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import { benutzer, mitarbeiter, protokoll, sitzungen } from "../db/schema.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("prot");
const ADMIN = `${marke}-admin@dels.ch`;
const BUERO = `${marke}-buero@dels.ch`;

let adminId: string;
let bueroId: string;

beforeAll(async () => {
  adminId = await benutzerAnlegen(`${marke} Admin`, ADMIN, "admin");
  bueroId = await benutzerAnlegen(`${marke} Buero`, BUERO, "buero");
});

afterAll(async () => {
  await db.delete(protokoll).where(like(protokoll.benutzerName, `${marke}%`));
  await db.delete(mitarbeiter).where(like(mitarbeiter.name, `${marke}%`));
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [adminId, bueroId]));
  await db.delete(benutzer).where(inArray(benutzer.id, [adminId, bueroId]));
  await datenbankSchliessen();
});

describe("Zugriff", () => {
  test("buero kommt nicht an das Protokoll", async () => {
    const klient = await anmelden(app, BUERO);
    expect((await klient.get("/api/protokoll")).status).toBe(403);
  });

  test("ohne Anmeldung 401", async () => {
    expect((await request(app).get("/api/protokoll")).status).toBe(401);
  });
});

describe("Inhalt", () => {
  test("eine Änderung taucht mit Benutzer, altem und neuem Wert auf", async () => {
    const klient = await anmelden(app, ADMIN);

    const angelegt = await klient
      .post("/api/mitarbeiter")
      .send({ name: `${marke} Person`, ort: "Basel" });
    expect(angelegt.status).toBe(201);

    await klient.patch(`/api/mitarbeiter/${angelegt.body.id}`).send({ ort: "Bern" });

    const { body } = await klient.get(`/api/protokoll?suche=${angelegt.body.id}&tage=1`);
    const aenderung = body.zeilen.find((z: { aktion: string }) => z.aktion === "aendern");

    expect(aenderung).toBeDefined();
    expect(aenderung.benutzerName).toContain(marke);
    expect(aenderung.tabelle).toBe("mitarbeiter");
    expect(aenderung.vorher).toEqual({ ort: "Basel" });
    expect(aenderung.nachher).toEqual({ ort: "Bern" });
  });

  test("lässt sich nach Bereich und Aktion einschraenken", async () => {
    const klient = await anmelden(app, ADMIN);

    const nurAnlegen = await klient.get("/api/protokoll?aktion=anlegen&tage=1");
    expect(nurAnlegen.status).toBe(200);
    expect(nurAnlegen.body.zeilen.every((z: { aktion: string }) => z.aktion === "anlegen")).toBe(
      true,
    );

    const nurMitarbeiter = await klient.get("/api/protokoll?tabelle=mitarbeiter&tage=1");
    expect(
      nurMitarbeiter.body.zeilen.every((z: { tabelle: string }) => z.tabelle === "mitarbeiter"),
    ).toBe(true);
  });

  test("es gibt keinen Weg, Protokolleintraege zu ändern oder zu löschen", async () => {
    const klient = await anmelden(app, ADMIN);
    const { body } = await klient.get("/api/protokoll?tage=1");
    const ersteId = body.zeilen[0]?.id;
    expect(ersteId).toBeDefined();

    // Ein Protokoll, das sich bereinigen laesst, ist wertlos.
    expect((await klient.delete(`/api/protokoll/${ersteId}`)).status).toBe(404);
    expect((await klient.patch(`/api/protokoll/${ersteId}`).send({ aktion: "x" })).status).toBe(
      404,
    );
  });

  test("ein unsinniger Zeitraum wird abgelehnt", async () => {
    const klient = await anmelden(app, ADMIN);
    expect((await klient.get("/api/protokoll?tage=0")).status).toBe(400);
    expect((await klient.get("/api/protokoll?aktion=verbiegen")).status).toBe(400);
  });
});
