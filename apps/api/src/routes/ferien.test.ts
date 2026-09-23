/**
 * Tests fuer den Ferienstand.
 *
 * Schwerpunkt liegt auf den Stellen, an denen eine falsche Zahl nicht
 * auffallen wuerde: der Uebertrag ueber den Jahreswechsel, der
 * uebernommene Saldo aus dem Excel, und die Trennung zwischen Monats-
 * und Stundenlohn. Ein Saldo, der um ein paar Tage danebenliegt, sieht
 * voellig plausibel aus und faellt erst auf, wenn ein Mitarbeiter
 * reklamiert.
 */
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { baueApp } from "../app.js";
import { datenbankSchliessen, db } from "../db/index.js";
import {
  benutzer,
  eintraege,
  ferienUebertrag,
  mitarbeiter,
  objekte,
  protokoll,
  sitzungen,
} from "../db/schema.js";
import { anmelden, benutzerAnlegen, markeErzeugen } from "../test/hilfen.js";

const app = baueApp();
const marke = markeErzeugen("ferien");
const MAIL_ADMIN = `${marke}-admin@dels.ch`;
const MAIL_BUERO = `${marke}-buero@dels.ch`;
const JAHR = 2039;

let adminId: string;
let bueroId: string;
let objektId: string;

/** Monatslohn, ganzes Jahr da, 25 Tage Anspruch. */
let monatId: string;
/** Monatslohn mit uebernommenem Saldo aus dem "Excel". */
let saldoId: string;
/** Monatslohn, Eintritt zur Jahresmitte. */
let neuId: string;
/** Monatslohn, lange dabei, ohne Stichtag: der Verlauf ist lueckenhaft. */
let langId: string;
/** Stundenlohn. */
let stundeId: string;

async function personAnlegen(
  name: string,
  werte: Partial<typeof mitarbeiter.$inferInsert>,
): Promise<string> {
  const [zeile] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} ${name}`, ferienanspruch: "25", ...werte })
    .returning({ id: mitarbeiter.id });
  return zeile!.id;
}

beforeAll(async () => {
  adminId = await benutzerAnlegen(`${marke} Admin`, MAIL_ADMIN, "admin");
  bueroId = await benutzerAnlegen(`${marke} Buero`, MAIL_BUERO, "buero");

  const [o] = await db
    .insert(objekte)
    .values({ name: `${marke} Objekt`, objektNr: `${marke}-1` })
    .returning({ id: objekte.id });
  objektId = o!.id;

  monatId = await personAnlegen("Monat", { lohnart: "monat", eintrittsdatum: `${JAHR - 1}-01-01` });
  saldoId = await personAnlegen("Saldo", {
    lohnart: "monat",
    eintrittsdatum: `${JAHR - 5}-01-01`,
    ferienSaldo: "7.00",
    ferienSaldoStand: `${JAHR - 1}-12-29`,
  });
  neuId = await personAnlegen("Neu", { lohnart: "monat", eintrittsdatum: `${JAHR}-07-01` });
  langId = await personAnlegen("Lang", { lohnart: "monat", eintrittsdatum: `${JAHR - 5}-01-01` });
  stundeId = await personAnlegen("Stunde", {
    lohnart: "stunde",
    eintrittsdatum: `${JAHR - 2}-01-01`,
    stundenlohn: "30.00",
  });

  await db.insert(eintraege).values([
    // Monat: 4 Tage im Vorjahr, 5 im Zieljahr.
    { mitarbeiterId: monatId, datum: `${JAHR - 1}-08-01`, art: "ferien", wert: "4.00" },
    { mitarbeiterId: monatId, datum: `${JAHR}-03-10`, art: "ferien", wert: "5.00" },

    // Saldo: ein Tag VOR dem Stichtag (steckt schon im Saldo) und einer
    // danach (muss abgezogen werden).
    { mitarbeiterId: saldoId, datum: `${JAHR - 1}-06-01`, art: "ferien", wert: "9.00" },
    { mitarbeiterId: saldoId, datum: `${JAHR - 1}-12-30`, art: "ferien", wert: "1.00" },
    { mitarbeiterId: saldoId, datum: `${JAHR}-05-05`, art: "ferien", wert: "2.00" },

    // Stunde: 100 Arbeitsstunden im Zieljahr.
    { mitarbeiterId: stundeId, objektId, datum: `${JAHR}-04-04`, art: "arbeit", wert: "60.00" },
    { mitarbeiterId: stundeId, objektId, datum: `${JAHR}-04-05`, art: "arbeit", wert: "40.00" },
    // Arbeit im Vorjahr darf die Basis nicht aufblaehen.
    {
      mitarbeiterId: stundeId,
      objektId,
      datum: `${JAHR - 1}-04-04`,
      art: "arbeit",
      wert: "500.00",
    },
  ]);
});

afterAll(async () => {
  const ids = [monatId, saldoId, neuId, langId, stundeId];
  await db.delete(protokoll).where(inArray(protokoll.benutzerId, [adminId, bueroId]));
  await db.delete(ferienUebertrag).where(inArray(ferienUebertrag.mitarbeiterId, ids));
  await db.delete(eintraege).where(inArray(eintraege.mitarbeiterId, ids));
  await db.delete(mitarbeiter).where(like(mitarbeiter.name, `${marke}%`));
  await db.delete(objekte).where(like(objekte.name, `${marke}%`));
  await db.delete(sitzungen).where(inArray(sitzungen.benutzerId, [adminId, bueroId]));
  await db.delete(benutzer).where(inArray(benutzer.id, [adminId, bueroId]));
  await datenbankSchliessen();
});

type Zeile = Record<string, unknown> & { art: string; name: string };

async function holeStand(mail = MAIL_ADMIN, jahr = JAHR) {
  const klient = await anmelden(app, mail);
  const antwort = await klient.get(`/api/ferien?jahr=${jahr}`);
  expect(antwort.status).toBe(200);
  const koerper = antwort.body as { jahr: number; darfLoehne: boolean; zeilen: Zeile[] };
  return {
    ...koerper,
    person: (name: string) => koerper.zeilen.find((z) => z.name === `${marke} ${name}`)!,
  };
}

describe("Ferienstand im Monatslohn", () => {
  test("schreibt den Rest des Vorjahres als Uebertrag fort", async () => {
    const { person } = await holeStand();
    const p = person("Monat");

    // Vorjahr: 25 Anspruch minus 4 bezogen = 21 uebrig.
    // Zieljahr: 21 Uebertrag plus 25 Anspruch minus 5 bezogen = 41.
    expect(p).toMatchObject({
      art: "monat",
      anspruch: 25,
      uebertrag: 21,
      bezogen: 5,
      rest: 41,
      uebertragGesetzt: false,
      // Kein Stichtag hinterlegt, also wird gewarnt, obwohl hier nur ein
      // einziges Vorjahr dranhaengt und die Zahl stimmt. Das Schild sagt
      // "ungesicherte Herkunft", nicht "falsch".
      verlaufUnvollstaendig: true,
    });
  });

  test("warnt, wenn der Uebertrag ohne Stichtag aus der Historie kommt", async () => {
    const { person } = await holeStand();

    /*
     * Eintritt fuenf Jahre vor dem Zieljahr, kein einziger erfasster
     * Ferientag, kein Stichtag. Gerechnet werden sechs Jahresanspruechte
     * (das Eintrittsjahr und das Zieljahr zaehlen beide mit), macht 150
     * Tage. Die sind
     * natuerlich nicht echt: da fehlt Erfassung, nicht Urlaub.
     *
     * Die Zahl wird trotzdem ausgeliefert, aber mit dem Warnschild
     * daran. Sie stillschweigend zu beschoenigen waere schlimmer: dann
     * sieht niemand mehr, dass fuer diese Person ein Stichtag fehlt.
     */
    expect(person("Lang")).toMatchObject({ rest: 150, verlaufUnvollstaendig: true });
  });

  test("zaehlt beim uebernommenen Saldo nur, was nach dem Stichtag bezogen wurde", async () => {
    const { person } = await holeStand();
    const p = person("Saldo");

    /*
     * Der Stichtag ist der 29.12. des Vorjahres, der Saldo 7 Tage.
     * Die 9 Tage vom Juni stecken da schon drin und duerfen NICHT
     * nochmal abgezogen werden. Der eine Tag vom 30.12. liegt danach.
     * Uebertrag ins Zieljahr also 7 - 1 = 6.
     * Zieljahr: 6 + 25 - 2 = 29.
     */
    expect(p).toMatchObject({ uebertrag: 6, bezogen: 2, rest: 29, verlaufUnvollstaendig: false });
  });

  test("rechnet den Anspruch bei Eintritt zur Jahresmitte anteilig", async () => {
    const { person } = await holeStand();
    expect(person("Neu")).toMatchObject({
      anspruch: 12.5,
      anspruchVoll: 25,
      anteilig: true,
      uebertrag: 0,
      rest: 12.5,
    });
  });
});

describe("Ferien im Stundenlohn", () => {
  test("weist Zuschlag und Entschaedigung aus statt eines Saldos", async () => {
    const { person } = await holeStand();
    const p = person("Stunde") as Record<string, number | string>;

    expect(p.art).toBe("stunde");
    expect(p.wochen).toBe(5);
    expect(p.zuschlag).toBeCloseTo(0.10638, 5);
    // 100 Stunden zu 30.00 = 3000.00, davon 10.638 % = 319.15.
    expect(p.stunden).toBe(100);
    expect(p.basis).toBe(3000);
    expect(p.entschaedigung).toBe(319.15);
    // Kein Tagessaldo: der waere fuer diese Gruppe schlicht erfunden.
    expect(p.rest).toBeUndefined();
  });

  test("nimmt nur die Stunden des angefragten Jahres als Basis", async () => {
    // Im Vorjahr stehen 500 Stunden. Kaemen die mit, waere die Basis
    // das Sechsfache.
    const { person } = await holeStand(MAIL_ADMIN, JAHR);
    expect((person("Stunde") as Record<string, number>).basis).toBe(3000);
  });
});

describe("Rechte", () => {
  test("Buero sieht die Tage, aber keine Frankenbetraege", async () => {
    const { darfLoehne, person } = await holeStand(MAIL_BUERO);
    expect(darfLoehne).toBe(false);

    const stunde = person("Stunde") as Record<string, unknown>;
    expect(stunde.basis).toBeNull();
    expect(stunde.entschaedigung).toBeNull();
    // Die Tage bleiben: das ist kein Geheimnis und Buero braucht es.
    expect(stunde.wochen).toBe(5);
    expect((person("Monat") as Record<string, number>).rest).toBe(41);
  });

  test("Admin sieht die Betraege", async () => {
    const { darfLoehne, person } = await holeStand(MAIL_ADMIN);
    expect(darfLoehne).toBe(true);
    expect((person("Stunde") as Record<string, number>).entschaedigung).toBe(319.15);
  });

  test("ohne Anmeldung gar nichts", async () => {
    const { status } = await (await import("supertest")).default(app).get("/api/ferien");
    expect(status).toBe(401);
  });
});

describe("Uebertrag von Hand", () => {
  test("uebersteuert die Rechnung und wird protokolliert", async () => {
    const klient = await anmelden(app, MAIL_ADMIN);

    const gesetzt = await klient
      .put(`/api/ferien/${monatId}/${JAHR}`)
      .send({ tage: 5, bemerkung: "Rest per 31.12. gestrichen, so vereinbart." });
    expect(gesetzt.status).toBe(200);

    const { person } = await holeStand();
    // Statt der gerechneten 21 gilt jetzt 5: 5 + 25 - 5 = 25.
    expect(person("Monat")).toMatchObject({
      uebertrag: 5,
      uebertragGesetzt: true,
      uebertragBemerkung: "Rest per 31.12. gestrichen, so vereinbart.",
      rest: 25,
    });

    const spuren = await db
      .select()
      .from(protokoll)
      .where(eq(protokoll.tabelle, "ferien_uebertrag"));
    expect(spuren.length).toBeGreaterThan(0);
    expect(spuren.at(-1)?.benutzerName).toContain(marke);
  });

  test("laesst sich aendern und wieder entfernen", async () => {
    const klient = await anmelden(app, MAIL_ADMIN);

    await klient
      .put(`/api/ferien/${monatId}/${JAHR}`)
      .send({ tage: 2.5, bemerkung: "Korrektur nach Ruecksprache." })
      .expect(200);
    expect((await holeStand()).person("Monat")).toMatchObject({ uebertrag: 2.5, rest: 22.5 });

    await klient.delete(`/api/ferien/${monatId}/${JAHR}`).expect(204);
    // Ohne gesetzten Wert wird wieder gerechnet.
    expect((await holeStand()).person("Monat")).toMatchObject({
      uebertrag: 21,
      uebertragGesetzt: false,
      rest: 41,
    });
  });

  test("verlangt eine Begruendung", async () => {
    const klient = await anmelden(app, MAIL_ADMIN);
    const antwort = await klient.put(`/api/ferien/${monatId}/${JAHR}`).send({ tage: 0 });
    expect(antwort.status).toBe(400);
  });

  test("nimmt keine Viertelstage", async () => {
    const klient = await anmelden(app, MAIL_ADMIN);
    const antwort = await klient
      .put(`/api/ferien/${monatId}/${JAHR}`)
      .send({ tage: 2.25, bemerkung: "Viertel gibt es nicht." });
    expect(antwort.status).toBe(400);
  });

  test("lehnt einen Uebertrag fuer Stundenloehner ab", async () => {
    const klient = await anmelden(app, MAIL_ADMIN);
    const antwort = await klient
      .put(`/api/ferien/${stundeId}/${JAHR}`)
      .send({ tage: 3, bemerkung: "Geht so nicht." });

    expect(antwort.status).toBe(422);
    expect(antwort.body.code).toBe("falsche_lohnart");
  });

  test("meldet sich, wenn nichts zu loeschen da ist", async () => {
    const klient = await anmelden(app, MAIL_ADMIN);
    await klient.delete(`/api/ferien/${neuId}/${JAHR}`).expect(404);
  });
});
