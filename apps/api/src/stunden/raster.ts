/**
 * Das Monatsraster: eine Zeile je Person, darunter je eine Zeile pro
 * Objekt, Tage als Spalten.
 *
 * Warum das hier liegt und nicht in der Route: es wird zweimal gebraucht,
 * einmal für den Bildschirm und einmal für den Excel-Export. Zwei
 * Abfragen, die dasselbe meinen, laufen früher oder später auseinander.
 * Dann zeigt der Bildschirm 148.5 Stunden und die exportierte Datei 147,
 * und niemand weiss mehr, welche Zahl stimmt. Also: eine Quelle.
 */
import { and, asc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { eintraege, mitarbeiter, objekte } from "../db/schema.js";

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

export type Tag = {
  datum: string;
  tag: number;
  wochentag: string;
  wochenende: boolean;
};

export type Zelle = { art: string; wert: string };

export type Objektzeile = {
  objektId: string;
  objektNr: string | null;
  name: string;
  tage: Record<string, Zelle>;
};

export type Summen = {
  arbeit: number;
  ferien: number;
  krankheit: number;
  unfall: number;
  feiertag: number;
  sonstiges: number;
};

export type Personenzeile = {
  id: string;
  name: string;
  personalnummer: string | null;
  sollProTag: string;
  aktiv: boolean;
  abwesenheiten: Record<string, string>;
  objekte: Objektzeile[];
  summen: Summen;
};

export type Monatsraster = {
  monat: string;
  tage: Tag[];
  mitarbeiter: Personenzeile[];
};

/** Erster Tag des Monats, erster Tag des Folgemonats, Anzahl Tage. */
export function monatsgrenzen(monat: string): { von: string; bis: string; tage: number } {
  const [jahr, nr] = monat.split("-").map(Number) as [number, number];
  // Tag 0 des Folgemonats ist der letzte Tag dieses Monats.
  const tage = new Date(Date.UTC(jahr, nr, 0)).getUTCDate();
  const naechster =
    nr === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(nr + 1).padStart(2, "0")}-01`;
  return { von: `${monat}-01`, bis: naechster, tage };
}

export function tageDesMonats(monat: string): Tag[] {
  const { tage: anzahl } = monatsgrenzen(monat);
  const [jahr, nr] = monat.split("-").map(Number) as [number, number];

  return Array.from({ length: anzahl }, (_, i) => {
    const tag = i + 1;
    const wochentag = new Date(Date.UTC(jahr, nr - 1, tag)).getUTCDay();
    return {
      datum: `${monat}-${String(tag).padStart(2, "0")}`,
      tag,
      wochentag: WOCHENTAGE[wochentag]!,
      wochenende: wochentag === 0 || wochentag === 6,
    };
  });
}

/**
 * @param monat      "JJJJ-MM"
 * @param alleZeigen true blendet auch ausgetretene Personen ohne
 *                   Erfassung ein. Sonst: aktive Personen plus alle, die
 *                   in diesem Monat etwas erfasst haben.
 */
export async function monatsraster(monat: string, alleZeigen: boolean): Promise<Monatsraster> {
  const { von, bis } = monatsgrenzen(monat);
  const tage = tageDesMonats(monat);

  const zeilen = await db
    .select({
      id: eintraege.id,
      mitarbeiterId: eintraege.mitarbeiterId,
      objektId: eintraege.objektId,
      datum: eintraege.datum,
      art: eintraege.art,
      wert: eintraege.wert,
      objektNr: objekte.objektNr,
      objektName: objekte.name,
    })
    .from(eintraege)
    .leftJoin(objekte, eq(eintraege.objektId, objekte.id))
    .where(and(gte(eintraege.datum, von), lt(eintraege.datum, bis)));

  const mitDaten = new Set(zeilen.map((z) => z.mitarbeiterId));

  const personen = await db
    .select({
      id: mitarbeiter.id,
      name: mitarbeiter.name,
      personalnummer: mitarbeiter.personalnummer,
      sollProTag: mitarbeiter.sollProTag,
      aktiv: mitarbeiter.aktiv,
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

  // Einmal nach Person gruppieren statt je Person durch alle Einträge zu
  // laufen. Bei 140 Personen und 4000 Einträgen ist das der Unterschied
  // zwischen 4000 und 560'000 Vergleichen.
  const nachPerson = new Map<string, typeof zeilen>();
  for (const z of zeilen) {
    const bisher = nachPerson.get(z.mitarbeiterId);
    if (bisher) bisher.push(z);
    else nachPerson.set(z.mitarbeiterId, [z]);
  }

  const raster = personen.map((person) => {
    const meine = nachPerson.get(person.id) ?? [];

    const abwesenheiten: Record<string, string> = {};
    const objektzeilen = new Map<string, Objektzeile>();
    const summen: Summen = {
      arbeit: 0,
      ferien: 0,
      krankheit: 0,
      unfall: 0,
      feiertag: 0,
      sonstiges: 0,
    };

    for (const z of meine) {
      if (z.art in summen) summen[z.art as keyof Summen] += Number(z.wert);

      if (z.objektId === null) {
        abwesenheiten[z.datum] = z.art;
        continue;
      }

      let zeile = objektzeilen.get(z.objektId);
      if (!zeile) {
        zeile = {
          objektId: z.objektId,
          objektNr: z.objektNr,
          name: z.objektName ?? "Unbekanntes Objekt",
          tage: {},
        };
        objektzeilen.set(z.objektId, zeile);
      }
      zeile.tage[z.datum] = { art: z.art, wert: z.wert };
    }

    return {
      id: person.id,
      name: person.name,
      personalnummer: person.personalnummer,
      sollProTag: person.sollProTag,
      aktiv: person.aktiv,
      abwesenheiten,
      objekte: [...objektzeilen.values()].sort((a, b) =>
        (a.objektNr ?? a.name).localeCompare(b.objektNr ?? b.name, "de-CH"),
      ),
      summen,
    };
  });

  return { monat, tage, mitarbeiter: raster };
}
