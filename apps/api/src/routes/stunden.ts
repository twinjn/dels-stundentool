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
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { brauchtRecht } from "../auth/guards.js";
import { db } from "../db/index.js";
import { eintraege, mitarbeiter, objekte } from "../db/schema.js";
import { nichtGefunden, ungueltig } from "../fehler.js";
import { monatsraster } from "../stunden/raster.js";

export const stundenRouter = Router();

const MonatSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Monat im Format JJJJ-MM erwartet.");

stundenRouter.get("/", brauchtRecht("stunden:lesen"), async (req, res) => {
  const monat = MonatSchema.parse(req.query.monat ?? "");
  const alleZeigen = req.query.alle === "true";
  res.json(await monatsraster(monat, alleZeigen));
});

const ZelleSchema = z.object({
  mitarbeiterId: z.uuid("Ungültige Mitarbeiter-ID."),
  objektId: z.uuid("Ungültige Objekt-ID.").nullable(),
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

  // Was in dieser Zelle bisher stand, kommt weg. Eine Zelle hält genau
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
 * Fügt einer Person eine leere Objektzeile hinzu.
 *
 * Es wird bewusst kein Eintrag angelegt: die Zeile entsteht erst durch
 * den ersten Wert. Der Browser hält sie solange als leere Zeile, damit
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
