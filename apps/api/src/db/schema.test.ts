/**
 * Tests gegen eine ECHTE Postgres-Datenbank, nicht gegen eine Attrappe.
 *
 * Der Grund: wir testen hier genau die Regeln, die die Datenbank selbst
 * durchsetzt (Fremdschluessel, Pruefregeln, Eindeutigkeit, Zahlentypen).
 * Eine Attrappe wuerde davon nichts abbilden und uns in falscher
 * Sicherheit wiegen.
 *
 * Voraussetzung: DATABASE_URL zeigt auf eine migrierte Datenbank.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { datenbankSchliessen, db } from "./index.js";
import { benutzer, eintraege, mitarbeiter, objekte } from "./schema.js";

// Eigener Namensraum, damit parallele Laeufe sich nicht ins Gehege kommen.
const marke = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let mitarbeiterId: string;
let objektId: string;

/**
 * Drizzle verpackt den eigentlichen Datenbankfehler: die aeussere Meldung
 * sagt nur "Failed query", der Grund mit dem Namen der verletzten Regel
 * steckt eine Ebene tiefer in "cause". Diese Funktion sammelt die ganze
 * Kette ein, damit Tests auf den echten Grund pruefen koennen.
 */
function fehlerkette(fehler: unknown): string {
  const teile: string[] = [];
  let aktuell: unknown = fehler;
  while (aktuell instanceof Error) {
    teile.push(aktuell.message);
    aktuell = aktuell.cause;
  }
  return teile.join(" | ");
}

/** Fuehrt etwas aus, das scheitern MUSS, und liefert die Fehlerkette. */
async function scheitertMit(aktion: () => Promise<unknown>): Promise<string> {
  try {
    await aktion();
  } catch (fehler) {
    return fehlerkette(fehler);
  }
  throw new Error("Erwartet wurde ein Fehler, die Aktion war aber erfolgreich.");
}

beforeAll(async () => {
  const [m] = await db
    .insert(mitarbeiter)
    .values({ name: `${marke} Mitarbeiter` })
    .returning();
  const [o] = await db
    .insert(objekte)
    .values({ name: `${marke} Objekt` })
    .returning();
  if (!m || !o) throw new Error("Testdaten konnten nicht angelegt werden.");
  mitarbeiterId = m.id;
  objektId = o.id;
});

afterAll(async () => {
  // Reihenfolge zaehlt: erst die Eintraege, dann die Stammdaten, sonst
  // blockieren die Fremdschluessel das Aufraeumen.
  await db.delete(eintraege).where(eq(eintraege.mitarbeiterId, mitarbeiterId));
  await db.delete(mitarbeiter).where(eq(mitarbeiter.id, mitarbeiterId));
  await db.delete(objekte).where(eq(objekte.id, objektId));
  await db.delete(benutzer).where(sql`${benutzer.name} like ${marke + "%"}`);
  await datenbankSchliessen();
});

describe("Regeln, die die Datenbank selbst durchsetzt", () => {
  test("gearbeitete Stunden ohne Objekt werden abgelehnt", async () => {
    const grund = await scheitertMit(() =>
      db.insert(eintraege).values({
        mitarbeiterId,
        objektId: null,
        datum: "2026-02-03",
        art: "arbeit",
        wert: "8.40",
      }),
    );
    expect(grund).toMatch(/eintraege_arbeit_braucht_objekt/);
  });

  test("Ferien ohne Objekt sind dagegen erlaubt", async () => {
    const [eintrag] = await db
      .insert(eintraege)
      .values({ mitarbeiterId, objektId: null, datum: "2026-02-04", art: "ferien", wert: "1" })
      .returning();
    expect(eintrag?.art).toBe("ferien");
  });

  test("ein Datum kommt als YYYY-MM-DD zurück und verschiebt sich nicht", async () => {
    // Der klassische Fehler: aus dem 1. Februar wird je nach Zeitzone der
    // 31. Januar, und die Schicht landet im falschen Lohnmonat.
    const [eintrag] = await db
      .insert(eintraege)
      .values({ mitarbeiterId, objektId, datum: "2026-02-01", art: "arbeit", wert: "8.40" })
      .returning();
    expect(eintrag?.datum).toBe("2026-02-01");
    expect(typeof eintrag?.datum).toBe("string");
  });

  test("Beträge kommen als Zeichenkette, nicht als Gleitkommazahl", async () => {
    const [eintrag] = await db
      .insert(eintraege)
      .values({ mitarbeiterId, objektId, datum: "2026-02-05", art: "spesen", wert: "12.35" })
      .returning();
    expect(eintrag?.wert).toBe("12.35");
    expect(typeof eintrag?.wert).toBe("string");
  });

  test("Sozialversicherungssaetze behalten sechs Nachkommastellen", async () => {
    // db.execute liefert das Ergebnisobjekt des Postgres-Treibers,
    // die Datensaetze stehen in .rows.
    const ergebnis = await db.execute<{ probe: string }>(
      sql`select cast(0.014494 as numeric(10,6)) as probe`,
    );
    expect(ergebnis.rows[0]?.probe).toBe("0.014494");
  });

  test("E-Mail ist unabhängig von Gross- und Kleinschreibung eindeutig", async () => {
    await db.insert(benutzer).values({
      name: `${marke} Erster`,
      email: `${marke}@dels.ch`,
      passwortHash: "platzhalter",
    });

    const grund = await scheitertMit(() =>
      db.insert(benutzer).values({
        name: `${marke} Zweiter`,
        email: `${marke.toUpperCase()}@DELS.CH`,
        passwortHash: "platzhalter",
      }),
    );
    expect(grund).toMatch(/benutzer_email_eindeutig/);
  });

  test("ein Mitarbeiter mit erfassten Stunden lässt sich nicht löschen", async () => {
    // Schutz gegen den teuersten Bedienfehler: ein Klick auf "Loeschen",
    // und die Lohndaten eines ganzen Jahres waeren weg.
    const grund = await scheitertMit(() =>
      db.delete(mitarbeiter).where(eq(mitarbeiter.id, mitarbeiterId)),
    );
    expect(grund).toMatch(/eintraege_mitarbeiter_id_mitarbeiter_id_fk/);
  });

  test("ein Objekt mit gebuchten Stunden lässt sich nicht löschen", async () => {
    const grund = await scheitertMit(() => db.delete(objekte).where(eq(objekte.id, objektId)));
    expect(grund).toMatch(/eintraege_objekt_id_objekte_id_fk/);
  });

  test("Einträge lassen sich nach Mitarbeiter und Monat finden", async () => {
    const treffer = await db
      .select()
      .from(eintraege)
      .where(
        and(
          eq(eintraege.mitarbeiterId, mitarbeiterId),
          sql`${eintraege.datum} >= '2026-02-01' and ${eintraege.datum} < '2026-03-01'`,
        ),
      );
    expect(treffer.length).toBeGreaterThanOrEqual(3);
  });
});
