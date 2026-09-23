/**
 * Tests für Monatsabschluss und Abgleich.
 *
 * Zwei Dinge werden hier geprüft, und beide sind Zusagen an den
 * Benutzer, nicht bloss Code: ein abgeschlossener Monat nimmt nichts
 * mehr an, und der Abgleich zeigt genau die Unterschiede, die zwischen
 * Stammdaten und Monat wirklich bestehen.
 */
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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
  objektAbo,
  protokoll,
  sitzungen,
} from "../db/schema.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("abschluss");
const ADMIN = `${marke}-admin@dels.ch`;
const BUERO = `${marke}-buero@dels.ch`;

// 1997, aus demselben Grund wie in kalkulation.test.ts: davor liegt
// garantiert kein echter Monat, der als Vorlage dazwischenfunken kann.
const MONAT = "1997-03-01";

let adminId: string;
let bueroId: string;
let objektId: string;
let personId: string;

beforeAll(async () => {
  adminId = await benutzerAnlegen(`${marke} Admin`, ADMIN, "admin");
  bueroId = await benutzerAnlegen(`${marke} Buero`, BUERO, "buero");

  const [o] = await db
    .insert(objekte)
    .values({ name: `${marke} Objekt`, objektNr: `${marke}-1`, aboBetrag: "900.00", aktiv: true })
    .returning({ id: objekte.id });
  objektId = o!.id;

  const [m] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Person`, personalnummer: `${marke}-p`, stundenlohn: "25.00" })
    .returning({ id: mitarbeiter.id });
  personId = m!.id;

  const klient = await anmelden(app, ADMIN);
  const angelegt = await klient.post(`/api/kalkulation/${MONAT}`);
  expect(angelegt.status).toBe(201);
});

afterAll(async () => {
  await db.delete(eintraege).where(eq(eintraege.mitarbeiterId, personId));
  await db.delete(kalkAdminkosten).where(eq(kalkAdminkosten.monat, MONAT));
  await db.delete(kalkObjektMonat).where(eq(kalkObjektMonat.monat, MONAT));
  await db.delete(kalkPersonMonat).where(eq(kalkPersonMonat.monat, MONAT));
  await db.delete(kalkMonat).where(eq(kalkMonat.monat, MONAT));
  await db.delete(objektAbo).where(eq(objektAbo.objektId, objektId));
  await db.delete(objekte).where(like(objekte.name, `${marke}%`));
  await db.delete(mitarbeiter).where(like(mitarbeiter.name, `${marke}%`));
  await db.delete(protokoll).where(inArray(protokoll.benutzerId, [adminId, bueroId]));
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [adminId, bueroId]));
  await db.delete(benutzer).where(inArray(benutzer.id, [adminId, bueroId]));
  await datenbankSchliessen();
});

describe("Monatsabschluss", () => {
  test("buero kommt nicht an den Abschluss", async () => {
    const klient = await anmelden(app, BUERO);
    expect((await klient.post(`/api/kalkulation/${MONAT}/abschluss`)).status).toBe(403);
  });

  test("abschliessen, sperren, wieder öffnen", async () => {
    const klient = await anmelden(app, ADMIN);

    // Vorher geht das Ändern.
    expect((await klient.patch(`/api/kalkulation/${MONAT}`).send({ mat: "20" })).status).toBe(200);

    const zu = await klient.post(`/api/kalkulation/${MONAT}/abschluss`);
    expect(zu.status).toBe(200);
    expect(zu.body.abgeschlossenAm).not.toBeNull();
    expect(zu.body.abgeschlossenVon).toBe(`${marke} Admin`);

    // Jetzt nicht mehr, und zwar auf allen Wegen.
    const gesperrt = await klient.patch(`/api/kalkulation/${MONAT}`).send({ mat: "30" });
    expect(gesperrt.status).toBe(409);
    expect(gesperrt.body.code).toBe("monat_abgeschlossen");

    expect(
      (await klient.patch(`/api/kalkulation/${MONAT}/objekt/${objektId}`).send({ ma: "2" })).status,
    ).toBe(409);
    expect(
      (
        await klient
          .post(`/api/kalkulation/${MONAT}/adminkosten`)
          .send({ position: "X", betrag: 1 })
      ).status,
    ).toBe(409);

    // Lesen bleibt erlaubt, sonst wäre der Monat unbrauchbar.
    const gelesen = await klient.get(`/api/kalkulation/${MONAT}`);
    expect(gelesen.status).toBe(200);
    expect(gelesen.body.ansaetze.mat).toBe("20.00");

    // Der Wert von vorher ist auch wirklich stehen geblieben.
    expect(gelesen.body.ansaetze.abgeschlossenVon).toBe(`${marke} Admin`);

    // Zweimal abschliessen ist ein Fehler, kein stilles Nichts.
    const nochmal = await klient.post(`/api/kalkulation/${MONAT}/abschluss`);
    expect(nochmal.status).toBe(409);
    expect(nochmal.body.code).toBe("schon_abgeschlossen");

    // Öffnen nur mit Begründung.
    expect((await klient.delete(`/api/kalkulation/${MONAT}/abschluss`).send({})).status).toBe(400);

    const auf = await klient
      .delete(`/api/kalkulation/${MONAT}/abschluss`)
      .send({ grund: "Nachtrag einer vergessenen Rechnung." });
    expect(auf.status).toBe(200);
    expect(auf.body.abgeschlossenAm).toBeNull();

    expect((await klient.patch(`/api/kalkulation/${MONAT}`).send({ mat: "30" })).status).toBe(200);
  });

  test("Abschluss und Öffnen stehen im Protokoll", async () => {
    const eintraegeImLog = await db
      .select()
      .from(protokoll)
      .where(eq(protokoll.benutzerId, adminId));

    const zumMonat = eintraegeImLog.filter(
      (z) => z.tabelle === "kalk_monat" && z.datensatzId === MONAT,
    );
    const nachher = zumMonat.map((z) => JSON.stringify(z.nachher ?? {}));

    expect(nachher.some((n) => n.includes('"abgeschlossen":true'))).toBe(true);
    expect(nachher.some((n) => n.includes("Nachtrag einer vergessenen Rechnung"))).toBe(true);
  });
});

describe("Abgleich", () => {
  test("ein neues Objekt fehlt im Monat und lässt sich nachziehen", async () => {
    const klient = await anmelden(app, ADMIN);

    const neu = await klient
      .post("/api/objekte")
      .send({ name: `${marke} Nachzuegler`, objektNr: `${marke}-2`, aboBetrag: "450.00" });
    expect(neu.status).toBe(201);
    const neueId = neu.body.id as string;

    const bericht = await klient.get(`/api/kalkulation/${MONAT}/abgleich`);
    expect(bericht.status).toBe(200);

    const fehlend = bericht.body.unterschiede.find(
      (u: { art: string; objektId?: string }) => u.art === "objekt_fehlt" && u.objektId === neueId,
    );
    expect(fehlend).toBeDefined();
    expect(fehlend.abo).toBe("450.00");

    const uebernommen = await klient
      .post(`/api/kalkulation/${MONAT}/abgleich`)
      .send({ schluessel: [`objekt_fehlt:${neueId}`] });
    expect(uebernommen.status).toBe(200);
    expect(uebernommen.body.bilanz.angelegt).toBe(1);

    const daten = await klient.get(`/api/kalkulation/${MONAT}`);
    const zeile = daten.body.objektMonat.find((o: { objektId: string }) => o.objektId === neueId);
    expect(zeile.aboBetrag).toBe("450.00");

    // Und danach meldet der Abgleich dieses Objekt nicht mehr.
    const zweiterBericht = await klient.get(`/api/kalkulation/${MONAT}/abgleich`);
    expect(
      zweiterBericht.body.unterschiede.some(
        (u: { art: string; objektId?: string }) =>
          u.art === "objekt_fehlt" && u.objektId === neueId,
      ),
    ).toBe(false);

    await db.delete(kalkObjektMonat).where(eq(kalkObjektMonat.objektId, neueId));
    await db.delete(objektAbo).where(eq(objektAbo.objektId, neueId));
    await db.delete(objekte).where(eq(objekte.id, neueId));
  });

  test("ein abweichender Abo-Betrag wird gemeldet und übernommen", async () => {
    const klient = await anmelden(app, ADMIN);

    await klient.post(`/api/objekte/${objektId}/preise`).send({
      gueltigAb: MONAT,
      betrag: 1200,
      bemerkung: "Preiserhöhung per März.",
    });

    const bericht = await klient.get(`/api/kalkulation/${MONAT}/abgleich`);
    const ab = bericht.body.unterschiede.find(
      (u: { art: string; objektId?: string }) =>
        u.art === "abo_weicht_ab" && u.objektId === objektId,
    );
    expect(ab).toBeDefined();
    expect(ab.imMonat).toBe("900.00");
    expect(ab.lautStammdaten).toBe("1200.00");

    const uebernommen = await klient
      .post(`/api/kalkulation/${MONAT}/abgleich`)
      .send({ schluessel: [`abo_weicht_ab:${objektId}`] });
    expect(uebernommen.body.bilanz.angepasst).toBe(1);

    const daten = await klient.get(`/api/kalkulation/${MONAT}`);
    const zeile = daten.body.objektMonat.find((o: { objektId: string }) => o.objektId === objektId);
    expect(zeile.aboBetrag).toBe("1200.00");
  });

  test("eine Person mit Stunden ohne Personalzeile wird gemeldet", async () => {
    const klient = await anmelden(app, ADMIN);

    await db.insert(eintraege).values({
      mitarbeiterId: personId,
      objektId,
      datum: "1997-03-14",
      art: "arbeit",
      wert: "7.50",
    });

    const bericht = await klient.get(`/api/kalkulation/${MONAT}/abgleich`);
    const fehlt = bericht.body.unterschiede.find(
      (u: { art: string; mitarbeiterId?: string }) =>
        u.art === "person_fehlt" && u.mitarbeiterId === personId,
    );
    expect(fehlt).toBeDefined();
    expect(fehlt.stunden).toBe(7.5);

    const uebernommen = await klient
      .post(`/api/kalkulation/${MONAT}/abgleich`)
      .send({ schluessel: [`person_fehlt:${personId}`] });
    expect(uebernommen.body.bilanz.personen).toBe(1);

    const daten = await klient.get(`/api/kalkulation/${MONAT}`);
    expect(
      daten.body.personMonat.some((p: { mitarbeiterId: string }) => p.mitarbeiterId === personId),
    ).toBe(true);
  });

  test("ein stillgelegtes Objekt wird gemeldet", async () => {
    const klient = await anmelden(app, ADMIN);
    await klient.patch(`/api/objekte/${objektId}`).send({ aktiv: false });

    const bericht = await klient.get(`/api/kalkulation/${MONAT}/abgleich`);
    const still = bericht.body.unterschiede.find(
      (u: { art: string; objektId?: string }) =>
        u.art === "objekt_stillgelegt" && u.objektId === objektId,
    );
    expect(still).toBeDefined();

    await klient
      .post(`/api/kalkulation/${MONAT}/abgleich`)
      .send({ schluessel: [`objekt_stillgelegt:${objektId}`] });

    const daten = await klient.get(`/api/kalkulation/${MONAT}`);
    const zeile = daten.body.objektMonat.find((o: { objektId: string }) => o.objektId === objektId);
    expect(zeile.aktiv).toBe(false);

    await klient.patch(`/api/objekte/${objektId}`).send({ aktiv: true });
  });

  test("ein Schlüssel, den es nicht mehr gibt, gibt 409 statt stillem Erfolg", async () => {
    const klient = await anmelden(app, ADMIN);
    const antwort = await klient
      .post(`/api/kalkulation/${MONAT}/abgleich`)
      .send({ schluessel: ["objekt_fehlt:00000000-0000-0000-0000-000000000000"] });
    expect(antwort.status).toBe(409);
    expect(antwort.body.code).toBe("nichts_zu_tun");
  });
});
