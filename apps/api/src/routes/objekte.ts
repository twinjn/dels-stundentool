/**
 * Objekte, also die Standorte, auf die Stunden gebucht werden.
 *
 * Einfacher als die Mitarbeiter: keine Lohnfelder, also auch keine
 * feldweise Rechtepruefung.
 */
import { ObjektAendernSchema, ObjektAnlegenSchema } from "@dels/shared";
import { asc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { brauchtRecht } from "../auth/guards.js";
import { db } from "../db/index.js";
import { eintraege, kalkObjektMonat, objekte } from "../db/schema.js";
import { HttpFehler, nichtGefunden } from "../fehler.js";
import { protokolliere, unterschiede } from "../protokoll.js";

export const objekteRouter = Router();

const IdSchema = z.uuid("Ungültige Objekt-ID.");

objekteRouter.get("/", brauchtRecht("stammdaten:lesen"), async (req, res) => {
  const nurAktive = req.query.nurAktive === "true";

  // Sortiert nach Name, mit Schweizer Sortierregeln: sonst landet
  // "Zürich" hinter "Zwingen", weil das Umlaut-Z anders einsortiert wird.
  const sortierung = asc(sql`${objekte.name} collate "de-CH-x-icu"`);

  const liste = nurAktive
    ? await db.select().from(objekte).where(eq(objekte.aktiv, true)).orderBy(sortierung)
    : await db.select().from(objekte).orderBy(sortierung);

  res.json(liste);
});

objekteRouter.get("/:id", brauchtRecht("stammdaten:lesen"), async (req, res) => {
  const id = IdSchema.parse(req.params.id);
  const [gefunden] = await db.select().from(objekte).where(eq(objekte.id, id));
  if (!gefunden) throw nichtGefunden("Dieses Objekt gibt es nicht.");
  res.json(gefunden);
});

objekteRouter.post("/", brauchtRecht("stammdaten:schreiben"), async (req, res) => {
  const daten = ObjektAnlegenSchema.parse(req.body);
  const [neu] = await db.insert(objekte).values(daten).returning();

  await protokolliere({
    benutzer: req.benutzer,
    aktion: "anlegen",
    tabelle: "objekte",
    datensatzId: neu?.id,
    nachher: daten,
  });

  res.status(201).json(neu);
});

objekteRouter.patch("/:id", brauchtRecht("stammdaten:schreiben"), async (req, res) => {
  const id = IdSchema.parse(req.params.id);
  const daten = ObjektAendernSchema.parse(req.body);

  const [vorher] = await db.select().from(objekte).where(eq(objekte.id, id));
  if (!vorher) throw nichtGefunden("Dieses Objekt gibt es nicht.");

  const [geaendert] = await db.update(objekte).set(daten).where(eq(objekte.id, id)).returning();

  const diff = unterschiede(vorher as Record<string, unknown>, daten);
  await protokolliere({
    benutzer: req.benutzer,
    aktion: "aendern",
    tabelle: "objekte",
    datensatzId: id,
    vorher: diff.vorher,
    nachher: diff.nachher,
  });

  res.json(geaendert);
});

objekteRouter.delete("/:id", brauchtRecht("stammdaten:schreiben"), async (req, res) => {
  const id = IdSchema.parse(req.params.id);

  const [vorher] = await db.select().from(objekte).where(eq(objekte.id, id));
  if (!vorher) throw nichtGefunden("Dieses Objekt gibt es nicht.");

  const [{ anzahl: stunden } = { anzahl: 0 }] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(eintraege)
    .where(eq(eintraege.objektId, id));

  const [{ anzahl: kalk } = { anzahl: 0 }] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(kalkObjektMonat)
    .where(eq(kalkObjektMonat.objektId, id));

  if (stunden > 0 || kalk > 0) {
    throw new HttpFehler(
      409,
      `Auf dieses Objekt sind ${stunden} Eintraege und ${kalk} Kalkulationszeilen gebucht. ` +
        "Setze es stattdessen auf inaktiv, dann bleibt die Vergangenheit auswertbar.",
      "hat_daten",
    );
  }

  await db.delete(objekte).where(eq(objekte.id, id));

  await protokolliere({
    benutzer: req.benutzer,
    aktion: "loeschen",
    tabelle: "objekte",
    datensatzId: id,
    vorher: { name: vorher.name, objektNr: vorher.objektNr },
  });

  res.status(204).end();
});
