/**
 * Preis-Historie der Objekte.
 *
 * WARUM ES SIE GIBT:
 *
 * Ein Abo-Preis ändert sich, aber er ändert sich immer ab einem Datum,
 * nie rückwirkend. Vorher gab es nur ein einziges Feld am Objekt. Wer
 * darin eine Erhöhung eintrug, hatte danach keine Möglichkeit mehr zu
 * sagen, was letzten März gegolten hatte, und eine Kalkulation, die
 * man neu anlegte, rechnete alte Monate mit dem neuen Preis.
 *
 * Jetzt ist objekt_abo die Wahrheit, und objekte.abo_betrag ist nur
 * noch die Anzeige davon: der Preis, der heute gilt. Beide werden hier
 * gemeinsam nachgeführt, damit sie nicht auseinanderlaufen können.
 */
import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { objekte, objektAbo } from "../db/schema.js";

/** db oder eine laufende Transaktion. */
export type Datenbank = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Heute als "JJJJ-MM-TT" in Schweizer Zeit. */
export function heute(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
}

/** Alle Preise eines Objekts, der jüngste zuoberst. */
export async function preisverlauf(objektId: string) {
  return db
    .select()
    .from(objektAbo)
    .where(eq(objektAbo.objektId, objektId))
    .orderBy(desc(objektAbo.gueltigAb));
}

/**
 * Preis ab einem Stichtag setzen.
 *
 * Gibt es für genau diesen Tag schon einen Eintrag, wird er ersetzt.
 * Zwei Preise am selben Tag wären nicht auflösbar, und die Datenbank
 * lässt sie über den eindeutigen Index ohnehin nicht zu.
 */
export async function preisSetzen(
  tx: Datenbank,
  angaben: {
    objektId: string;
    gueltigAb: string;
    betrag: string;
    bemerkung?: string | null;
    erfasstVon?: string | null;
  },
) {
  const [zeile] = await tx
    .insert(objektAbo)
    .values({
      objektId: angaben.objektId,
      gueltigAb: angaben.gueltigAb,
      betrag: angaben.betrag,
      bemerkung: angaben.bemerkung ?? null,
      erfasstVon: angaben.erfasstVon ?? null,
    })
    .onConflictDoUpdate({
      target: [objektAbo.objektId, objektAbo.gueltigAb],
      set: {
        betrag: angaben.betrag,
        bemerkung: angaben.bemerkung ?? null,
        erfasstVon: angaben.erfasstVon ?? null,
      },
    })
    .returning();

  await stammpreisNachziehen(tx, angaben.objektId);
  return zeile;
}

/**
 * objekte.abo_betrag auf den heute gültigen Preis setzen.
 *
 * Wird nach jeder Änderung an der Historie gerufen. Ein in der Zukunft
 * liegender Preis verändert das Stammblatt dadurch noch nicht, er
 * greift erst, wenn sein Tag da ist oder wenn ein Monat angelegt wird,
 * der nach diesem Tag beginnt.
 */
export async function stammpreisNachziehen(tx: Datenbank, objektId: string) {
  const [gueltig] = await tx
    .select({ betrag: objektAbo.betrag })
    .from(objektAbo)
    .where(and(eq(objektAbo.objektId, objektId), lte(objektAbo.gueltigAb, heute())))
    .orderBy(desc(objektAbo.gueltigAb))
    .limit(1);

  await tx
    .update(objekte)
    .set({ aboBetrag: gueltig?.betrag ?? null })
    .where(eq(objekte.id, objektId));

  return gueltig?.betrag ?? null;
}

/** Einen Preiseintrag entfernen und das Stammblatt nachziehen. */
export async function preisLoeschen(objektId: string, preisId: string) {
  return db.transaction(async (tx) => {
    const [weg] = await tx
      .delete(objektAbo)
      .where(and(eq(objektAbo.id, preisId), eq(objektAbo.objektId, objektId)))
      .returning();
    if (!weg) return null;
    await stammpreisNachziehen(tx, objektId);
    return weg;
  });
}
