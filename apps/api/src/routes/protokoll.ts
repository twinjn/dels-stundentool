/**
 * Das Aenderungsprotokoll ansehen.
 *
 * Nur fuer Admins: hier steht drin, wer wann welche Personendaten
 * angefasst hat, mitsamt altem und neuem Wert.
 *
 * Es gibt bewusst KEINE Route zum Loeschen oder Aendern. Ein Protokoll,
 * das sich nachtraeglich bearbeiten laesst, beantwortet die Frage nicht
 * mehr, fuer die es da ist.
 */
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { brauchtRecht } from "../auth/guards.js";
import { db } from "../db/index.js";
import { protokoll } from "../db/schema.js";

export const protokollRouter = Router();

protokollRouter.use(brauchtRecht("benutzer:verwalten"));

const AbfrageSchema = z.object({
  tabelle: z.string().max(40).optional(),
  aktion: z.enum(["anlegen", "aendern", "loeschen", "exportieren"]).optional(),
  suche: z.string().max(80).optional(),
  tage: z.coerce.number().int().min(1).max(3650).default(90),
  seite: z.coerce.number().int().min(1).default(1),
});

const PRO_SEITE = 50;

protokollRouter.get("/", async (req, res) => {
  const abfrage = AbfrageSchema.parse(req.query);

  const ab = new Date(Date.now() - abfrage.tage * 24 * 60 * 60 * 1000);

  const bedingungen = [gte(protokoll.zeitpunkt, ab)];
  if (abfrage.tabelle) bedingungen.push(eq(protokoll.tabelle, abfrage.tabelle));
  if (abfrage.aktion) bedingungen.push(eq(protokoll.aktion, abfrage.aktion));
  if (abfrage.suche) {
    const muster = `%${abfrage.suche.toLowerCase()}%`;
    bedingungen.push(
      sql`(lower(coalesce(${protokoll.benutzerName}, '')) like ${muster}
           or lower(coalesce(${protokoll.datensatzId}, '')) like ${muster})`,
    );
  }

  const wo = and(...bedingungen);

  const [gesamt] = await db.select({ anzahl: count() }).from(protokoll).where(wo);

  const zeilen = await db
    .select()
    .from(protokoll)
    .where(wo)
    .orderBy(desc(protokoll.zeitpunkt))
    .limit(PRO_SEITE)
    .offset((abfrage.seite - 1) * PRO_SEITE);

  // Welche Tabellen kommen ueberhaupt vor: fuer die Auswahlliste.
  const tabellen = await db
    .selectDistinct({ tabelle: protokoll.tabelle })
    .from(protokoll)
    .orderBy(protokoll.tabelle);

  res.json({
    zeilen,
    gesamt: gesamt?.anzahl ?? 0,
    seite: abfrage.seite,
    proSeite: PRO_SEITE,
    tabellen: tabellen.map((t) => t.tabelle),
  });
});
