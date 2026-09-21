/**
 * Jahresuebersicht: zwoelf Monate je Person, nach Eintragsart getrennt.
 *
 * Das ist die Ansicht, die im Excel das Jahresblatt war. Sie beantwortet
 * die Fragen, die eine Monatsansicht nicht beantworten kann: wie viele
 * Ferientage hat jemand dieses Jahr schon bezogen, in welchen Monaten
 * war jemand krank, wie verteilt sich die Arbeit ueber das Jahr.
 *
 * Wie beim Monatsraster liegt das hier und nicht in der Route, weil es
 * zweimal gebraucht wird: einmal fuer den Bildschirm, einmal fuer den
 * Excel-Export.
 */
import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { eintraege, mitarbeiter } from "../db/schema.js";

export const ARTEN = ["arbeit", "ferien", "krankheit", "unfall", "feiertag", "sonstiges"] as const;

export type Art = (typeof ARTEN)[number];
export type Summen = Record<Art, number>;

export type Jahreszeile = {
  id: string;
  name: string;
  personalnummer: string | null;
  aktiv: boolean;
  ferienanspruch: number;
  ferienSaldo: number | null;
  ferienSaldoStand: string | null;
  /** Zwoelf Eintraege, Index 0 ist Januar. */
  monate: Summen[];
  jahr: Summen;
};

export type Jahresuebersicht = {
  jahr: number;
  mitarbeiter: Jahreszeile[];
};

function leereSummen(): Summen {
  return { arbeit: 0, ferien: 0, krankheit: 0, unfall: 0, feiertag: 0, sonstiges: 0 };
}

export async function jahresuebersicht(
  jahr: number,
  alleZeigen: boolean,
): Promise<Jahresuebersicht> {
  const von = `${jahr}-01-01`;
  const bis = `${jahr}-12-31`;

  // Eine Abfrage fuer das ganze Jahr: Person, Monat, Art, Summe.
  // Rund 4000 Eintraege werden damit zu hoechstens ein paar hundert
  // Zeilen, und der Browser bekommt nur diese.
  const summen = await db
    .select({
      mitarbeiterId: eintraege.mitarbeiterId,
      monat: sql<string>`extract(month from ${eintraege.datum})`,
      art: eintraege.art,
      summe: sql<string>`sum(${eintraege.wert})`,
    })
    .from(eintraege)
    .where(
      and(gte(eintraege.datum, von), lte(eintraege.datum, bis), inArray(eintraege.art, [...ARTEN])),
    )
    .groupBy(eintraege.mitarbeiterId, sql`extract(month from ${eintraege.datum})`, eintraege.art);

  const mitDaten = new Set(summen.map((z) => z.mitarbeiterId));

  const personen = await db
    .select({
      id: mitarbeiter.id,
      name: mitarbeiter.name,
      personalnummer: mitarbeiter.personalnummer,
      aktiv: mitarbeiter.aktiv,
      ferienanspruch: mitarbeiter.ferienanspruch,
      ferienSaldo: mitarbeiter.ferienSaldo,
      ferienSaldoStand: mitarbeiter.ferienSaldoStand,
    })
    .from(mitarbeiter)
    .where(
      alleZeigen
        ? sql`true`
        : mitDaten.size > 0
          ? or(eq(mitarbeiter.aktiv, true), inArray(mitarbeiter.id, [...mitDaten]))
          : eq(mitarbeiter.aktiv, true),
    )
    .orderBy(asc(sql`${mitarbeiter.name} collate "de-CH-x-icu"`));

  const zeilen = new Map<string, Jahreszeile>();
  for (const person of personen) {
    zeilen.set(person.id, {
      id: person.id,
      name: person.name,
      personalnummer: person.personalnummer,
      aktiv: person.aktiv,
      ferienanspruch: Number(person.ferienanspruch),
      ferienSaldo: person.ferienSaldo === null ? null : Number(person.ferienSaldo),
      ferienSaldoStand: person.ferienSaldoStand,
      monate: Array.from({ length: 12 }, leereSummen),
      jahr: leereSummen(),
    });
  }

  for (const z of summen) {
    const zeile = zeilen.get(z.mitarbeiterId);
    // Kann vorkommen, wenn jemand ausgetreten ist und "alle" nicht
    // gewaehlt wurde. Dann gehoert die Zeile schlicht nicht hierher.
    if (!zeile) continue;

    const monatIndex = Number(z.monat) - 1;
    const art = z.art as Art;
    const wert = Number(z.summe);
    zeile.monate[monatIndex]![art] += wert;
    zeile.jahr[art] += wert;
  }

  return { jahr, mitarbeiter: [...zeilen.values()] };
}
