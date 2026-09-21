/**
 * Tests fuer die Stundenerfassung.
 * Schwerpunkt: dass eine Zelle genau einen Wert haelt und dass Ferien
 * nicht versehentlich an einem Objekt landen.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import { benutzer, eintraege, mitarbeiter, objekte, sitzungen } from "../db/schema.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("std");
const MAIL = `${marke}@dels.ch`;
const MONAT = "2031-05"; // weit weg von echten Daten
const TAG = `${MONAT}-04`;

let benutzerId: string;
let personId: string;
let objektId: string;

beforeAll(async () => {
  benutzerId = await benutzerAnlegen(`${marke} Buero`, MAIL, "buero");
  const [p] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Person` })
    .returning({ id: mitarbeiter.id });
  personId = p!.id;
  const [o] = await db
    .insert(objekte)
    .values({ name: `${marke} Objekt`, objektNr: `${marke}-1` })
    .returning({ id: objekte.id });
  objektId = o!.id;
});

afterAll(async () => {
  await db.delete(eintraege).where(eq(eintraege.mitarbeiterId, personId));
  await db.delete(mitarbeiter).where(like(mitarbeiter.name, `${marke}%`));
  await db.delete(objekte).where(like(objekte.name, `${marke}%`));
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [benutzerId]));
  await db.delete(benutzer).where(eq(benutzer.id, benutzerId));
  await datenbankSchliessen();
});

async function setzeZelle(
  klient: Awaited<ReturnType<typeof anmelden>>,
  objekt: string | null,
  eingabe: string,
  datum = TAG,
) {
  return klient
    .put("/api/stunden/zelle")
    .send({ mitarbeiterId: personId, objektId: objekt, datum, eingabe });
}

describe("Monatsraster", () => {
  test("liefert die Tage des Monats mit Wochentagen", async () => {
    const klient = await anmelden(app, MAIL);
    const antwort = await klient.get(`/api/stunden?monat=${MONAT}`);

    expect(antwort.status).toBe(200);
    expect(antwort.body.tage).toHaveLength(31); // Mai
    expect(antwort.body.tage[0]).toMatchObject({ datum: `${MONAT}-01`, tag: 1 });
    expect(antwort.body.tage.filter((t: { wochenende: boolean }) => t.wochenende).length).toBe(9);
  });

  test("ein unsinniger Monat wird abgelehnt", async () => {
    const klient = await anmelden(app, MAIL);
    expect((await klient.get("/api/stunden?monat=2031-13")).status).toBe(400);
    expect((await klient.get("/api/stunden?monat=Mai")).status).toBe(400);
  });

  test("ohne Anmeldung kommt man nicht heran", async () => {
    expect((await request(app).get(`/api/stunden?monat=${MONAT}`)).status).toBe(401);
  });
});

describe("Zellen setzen", () => {
  test("Stunden landen auf der Objektzeile", async () => {
    const klient = await anmelden(app, MAIL);
    const antwort = await setzeZelle(klient, objektId, "8,4");

    expect(antwort.status).toBe(200);
    expect(antwort.body.zelle).toEqual({ art: "arbeit", wert: "8.40" });
  });

  test("eine Zelle haelt genau einen Wert", async () => {
    const klient = await anmelden(app, MAIL);
    await setzeZelle(klient, objektId, "8");
    await setzeZelle(klient, objektId, "6");

    const treffer = await db
      .select()
      .from(eintraege)
      .where(and(eq(eintraege.mitarbeiterId, personId), eq(eintraege.datum, TAG)));

    expect(treffer.filter((t) => t.objektId === objektId)).toHaveLength(1);
    expect(treffer.find((t) => t.objektId === objektId)?.wert).toBe("6.00");
  });

  test("leere Eingabe loescht den Eintrag", async () => {
    const klient = await anmelden(app, MAIL);
    await setzeZelle(klient, objektId, "8");
    const antwort = await setzeZelle(klient, objektId, "");

    expect(antwort.body.zelle).toBeNull();
    const treffer = await db
      .select()
      .from(eintraege)
      .where(
        and(
          eq(eintraege.mitarbeiterId, personId),
          eq(eintraege.datum, TAG),
          eq(eintraege.objektId, objektId),
        ),
      );
    expect(treffer).toHaveLength(0);
  });

  test("Ferien gehoeren auf die Personenzeile", async () => {
    const klient = await anmelden(app, MAIL);
    const antwort = await setzeZelle(klient, null, "F", `${MONAT}-06`);

    expect(antwort.status).toBe(200);
    expect(antwort.body.zelle).toEqual({ art: "ferien", wert: "1.00" });
  });

  test("Ferien auf einer Objektzeile werden abgelehnt", async () => {
    // Genau diese Verwechslung erzeugte im Excel die halben Ferientage.
    const klient = await anmelden(app, MAIL);
    const antwort = await setzeZelle(klient, objektId, "F", `${MONAT}-07`);

    expect(antwort.status).toBe(400);
    expect(antwort.body.nachricht).toMatch(/gehoert zur Person/);
  });

  test("Stunden auf der Personenzeile werden abgelehnt", async () => {
    const klient = await anmelden(app, MAIL);
    const antwort = await setzeZelle(klient, null, "8", `${MONAT}-08`);
    expect(antwort.status).toBe(400);
  });

  test("eine Person hat pro Tag hoechstens eine Abwesenheit", async () => {
    const klient = await anmelden(app, MAIL);
    await setzeZelle(klient, null, "F", `${MONAT}-09`);
    await setzeZelle(klient, null, "K", `${MONAT}-09`);

    const treffer = await db
      .select()
      .from(eintraege)
      .where(and(eq(eintraege.mitarbeiterId, personId), eq(eintraege.datum, `${MONAT}-09`)));

    expect(treffer).toHaveLength(1);
    expect(treffer[0]?.art).toBe("krankheit");
  });

  test("festgehalten wird, wer es eingetragen hat", async () => {
    const klient = await anmelden(app, MAIL);
    await setzeZelle(klient, objektId, "4", `${MONAT}-12`);

    const [treffer] = await db
      .select()
      .from(eintraege)
      .where(and(eq(eintraege.mitarbeiterId, personId), eq(eintraege.datum, `${MONAT}-12`)));

    expect(treffer?.erfasstVon).toBe(benutzerId);
  });

  test("das Raster zeigt danach Abwesenheiten und Objektzeilen getrennt", async () => {
    const klient = await anmelden(app, MAIL);
    await setzeZelle(klient, objektId, "3", `${MONAT}-20`);
    await setzeZelle(klient, null, "U", `${MONAT}-21`);

    const antwort = await klient.get(`/api/stunden?monat=${MONAT}`);
    const person = antwort.body.mitarbeiter.find((m: { id: string }) => m.id === personId);

    expect(person.abwesenheiten[`${MONAT}-21`]).toBe("unfall");
    expect(person.objekte[0].tage[`${MONAT}-20`]).toEqual({ art: "arbeit", wert: "3.00" });
    expect(person.summen.arbeit).toBeGreaterThan(0);
    expect(person.summen.unfall).toBe(1);
  });
});
