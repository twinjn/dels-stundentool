/**
 * Stundenerfassung: das Monatsraster laden und einzelne Zellen setzen.
 *
 * Aufgebaut wie das gewohnte Monatsblatt: eine Zeile je Person, darunter
 * je eine Zeile pro Objekt, Tage als Spalten.
 *
 * EIN UNTERSCHIED ZU EXCEL, bewusst: dort steht eine Abwesenheit auf
 * jeder Objektzeile der Person. Hier steht sie einmal, auf der
 * Personenzeile. Das ist dieselbe Information ohne die Doppelung, die im
 * Excel die halben Ferientage erzeugt hat.
 */
import { deuteZelleneingabe, istFehler } from "@dels/shared";
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { brauchtRecht } from "../auth/guards.js";
import { db } from "../db/index.js";
import { eintraege, mitarbeiter, objekte } from "../db/schema.js";
import { nichtGefunden, ungueltig } from "../fehler.js";

export const stundenRouter = Router();

const MonatSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Monat im Format JJJJ-MM erwartet.");

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

function monatsgrenzen(monat: string): { von: string; bis: string; tage: number } {
  const [jahr, nr] = monat.split("-").map(Number) as [number, number];
  const tage = new Date(Date.UTC(jahr, nr, 0)).getUTCDate();
  const naechster =
    nr === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(nr + 1).padStart(2, "0")}-01`;
  return { von: `${monat}-01`, bis: naechster, tage };
}

stundenRouter.get("/", brauchtRecht("stunden:lesen"), async (req, res) => {
  const monat = MonatSchema.parse(req.query.monat ?? "");
  const alleZeigen = req.query.alle === "true";
  const { von, bis, tage: anzahlTage } = monatsgrenzen(monat);

  const [jahr, nr] = monat.split("-").map(Number) as [number, number];
  const tage = Array.from({ length: anzahlTage }, (_, i) => {
    const tag = i + 1;
    const wochentag = new Date(Date.UTC(jahr, nr - 1, tag)).getUTCDay();
    return {
      datum: `${monat}-${String(tag).padStart(2, "0")}`,
      tag,
      wochentag: WOCHENTAGE[wochentag]!,
      wochenende: wochentag === 0 || wochentag === 6,
    };
  });

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

  type Objektzeile = {
    objektId: string;
    objektNr: string | null;
    name: string;
    tage: Record<string, { art: string; wert: string }>;
  };

  const raster = personen.map((person) => {
    const meine = zeilen.filter((z) => z.mitarbeiterId === person.id);

    const abwesenheiten: Record<string, string> = {};
    const objektzeilen = new Map<string, Objektzeile>();

    for (const z of meine) {
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

    const summen = { arbeit: 0, ferien: 0, krankheit: 0, unfall: 0, feiertag: 0, sonstiges: 0 };
    for (const z of meine) {
      if (z.art in summen) {
        summen[z.art as keyof typeof summen] += Number(z.wert);
      }
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

  res.json({ monat, tage, mitarbeiter: raster });
});

const ZelleSchema = z.object({
  mitarbeiterId: z.uuid("Ungueltige Mitarbeiter-ID."),
  objektId: z.uuid("Ungueltige Objekt-ID.").nullable(),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT erwartet."),
  eingabe: z.string().max(10),
});

stundenRouter.put("/zelle", brauchtRecht("stunden:schreiben"), async (req, res) => {
  const daten = ZelleSchema.parse(req.body);
  const fuerObjekt = daten.objektId !== null;

  const gedeutet = deuteZelleneingabe(daten.eingabe, fuerObjekt);
  if (istFehler(gedeutet)) throw ungueltig(gedeutet.fehler);

  const [person] = await db
    .select({ id: mitarbeiter.id })
    .from(mitarbeiter)
    .where(eq(mitarbeiter.id, daten.mitarbeiterId));
  if (!person) throw nichtGefunden("Diesen Mitarbeiter gibt es nicht.");

  // Was in dieser Zelle bisher stand, kommt weg. Eine Zelle haelt genau
  // einen Wert, genau wie in Excel.
  const trifftZelle = and(
    eq(eintraege.mitarbeiterId, daten.mitarbeiterId),
    eq(eintraege.datum, daten.datum),
    fuerObjekt ? eq(eintraege.objektId, daten.objektId!) : isNull(eintraege.objektId),
  );

  const ergebnis = await db.transaction(async (tx) => {
    await tx.delete(eintraege).where(trifftZelle);

    if (gedeutet.leeren) return null;

    const [neu] = await tx
      .insert(eintraege)
      .values({
        mitarbeiterId: daten.mitarbeiterId,
        objektId: daten.objektId,
        datum: daten.datum,
        art: gedeutet.art,
        wert: gedeutet.wert,
        erfasstVon: req.benutzer?.id ?? null,
      })
      .returning({ art: eintraege.art, wert: eintraege.wert });

    return neu ?? null;
  });

  res.json({ zelle: ergebnis });
});

/**
 * Fuegt einer Person eine leere Objektzeile hinzu.
 *
 * Es wird bewusst kein Eintrag angelegt: die Zeile entsteht erst durch
 * den ersten Wert. Der Browser haelt sie solange als leere Zeile, damit
 * man hineinschreiben kann.
 */
stundenRouter.get("/objekte", brauchtRecht("stunden:lesen"), async (_req, res) => {
  const liste = await db
    .select({ id: objekte.id, objektNr: objekte.objektNr, name: objekte.name })
    .from(objekte)
    .where(eq(objekte.aktiv, true))
    .orderBy(asc(sql`${objekte.name} collate "de-CH-x-icu"`));
  res.json(liste);
});
