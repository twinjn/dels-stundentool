/**
 * Die Eingangsdaten einer Monatskalkulation an einem Ort.
 *
 * Gerechnet wird damit NICHT hier, sondern mit rechne() aus @dels/shared.
 * Die Route reicht diese Daten an den Browser durch, der Excel-Export
 * gibt sie direkt in rechne(). Beide Wege benutzen also dieselben
 * Eingaben und dieselbe Rechnung. Ein exportiertes Blatt, das andere
 * Zahlen zeigt als der Bildschirm, ist damit ausgeschlossen.
 */
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  eintraege,
  kalkAdminkosten,
  kalkMonat,
  kalkObjektMonat,
  kalkPersonMonat,
  mitarbeiter,
  objekte,
} from "../db/schema.js";
import { nichtGefunden } from "../fehler.js";

/** Monatsanfang und Anfang des Folgemonats. */
export function monatsgrenzen(monat: string): { von: string; bis: string } {
  const [jahr, nr] = monat.split("-").map(Number) as [number, number];
  const naechster =
    nr === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(nr + 1).padStart(2, "0")}-01`;
  return { von: monat, bis: naechster };
}

/**
 * @param monat "JJJJ-MM-01"
 * @throws wenn fuer den Monat noch keine Kalkulation angelegt ist
 */
export async function kalkulationsdaten(monat: string) {
  const [ansaetze] = await db.select().from(kalkMonat).where(eq(kalkMonat.monat, monat));
  if (!ansaetze) {
    throw nichtGefunden(`Für ${monat} ist noch kein Monat angelegt.`);
  }

  const { von, bis } = monatsgrenzen(monat);

  const [objektZeilen, personZeilen, admin, stunden, saetze] = await Promise.all([
    db
      .select({
        monat: kalkObjektMonat.monat,
        objektId: kalkObjektMonat.objektId,
        aboBetrag: kalkObjektMonat.aboBetrag,
        stdManuell: kalkObjektMonat.stdManuell,
        lohnManuell: kalkObjektMonat.lohnManuell,
        ma: kalkObjektMonat.ma,
        aktiv: kalkObjektMonat.aktiv,
        objektNr: objekte.objektNr,
        objektName: objekte.name,
      })
      .from(kalkObjektMonat)
      .innerJoin(objekte, eq(kalkObjektMonat.objektId, objekte.id))
      .where(eq(kalkObjektMonat.monat, monat))
      .orderBy(asc(sql`${objekte.name} collate "de-CH-x-icu"`)),

    db
      .select({
        monat: kalkPersonMonat.monat,
        mitarbeiterId: kalkPersonMonat.mitarbeiterId,
        lohn: kalkPersonMonat.lohn,
        spesen: kalkPersonMonat.spesen,
        ml13: kalkPersonMonat.ml13,
        abzugAhv: kalkPersonMonat.abzugAhv,
        abzugAlv: kalkPersonMonat.abzugAlv,
        abzugRpk: kalkPersonMonat.abzugRpk,
        abzugFak: kalkPersonMonat.abzugFak,
        fakManuell: kalkPersonMonat.fakManuell,
        bvg: kalkPersonMonat.bvg,
        bvgManuell: kalkPersonMonat.bvgManuell,
        name: mitarbeiter.name,
        personalnummer: mitarbeiter.personalnummer,
      })
      .from(kalkPersonMonat)
      .innerJoin(mitarbeiter, eq(kalkPersonMonat.mitarbeiterId, mitarbeiter.id))
      .where(eq(kalkPersonMonat.monat, monat))
      .orderBy(asc(sql`${mitarbeiter.name} collate "de-CH-x-icu"`)),

    db
      .select()
      .from(kalkAdminkosten)
      .where(eq(kalkAdminkosten.monat, monat))
      .orderBy(asc(kalkAdminkosten.sortierung), asc(kalkAdminkosten.position)),

    // Nur die Arbeitseintraege des Monats: mehr braucht der Rechenkern nicht.
    db
      .select({
        mitarbeiterId: eintraege.mitarbeiterId,
        objektId: eintraege.objektId,
        datum: eintraege.datum,
        art: eintraege.art,
        wert: eintraege.wert,
      })
      .from(eintraege)
      .where(and(eq(eintraege.art, "arbeit"), gte(eintraege.datum, von), lt(eintraege.datum, bis))),

    db
      .select({ id: mitarbeiter.id, name: mitarbeiter.name, stundenlohn: mitarbeiter.stundenlohn })
      .from(mitarbeiter),
  ]);

  return {
    monat,
    ansaetze,
    objektMonat: objektZeilen,
    personMonat: personZeilen,
    adminkosten: admin,
    eintraege: stunden,
    mitarbeiter: saetze,
  };
}
