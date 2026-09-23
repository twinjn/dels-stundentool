/**
 * Objekte, also die Standorte, auf die Stunden gebucht werden.
 *
 * Einfacher als die Mitarbeiter: keine Lohnfelder, also auch keine
 * feldweise Rechteprüfung.
 */
import { ObjektAendernSchema, ObjektAnlegenSchema } from "@dels/shared";
import { asc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { brauchtRecht } from "../auth/guards.js";
import { db } from "../db/index.js";
import { eintraege, kalkObjektMonat, objekte } from "../db/schema.js";
import { HttpFehler, nichtGefunden } from "../fehler.js";
import { heute, preisLoeschen, preisSetzen, preisverlauf } from "../objekte/preise.js";
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

  const neu = await db.transaction(async (tx) => {
    const [zeile] = await tx.insert(objekte).values(daten).returning();
    // Gleich als ersten Eintrag in die Historie, sonst stünde ein neues
    // Objekt ohne Preisverlauf da und fiele beim Anlegen eines Monats
    // auf 0 zurück.
    if (zeile && daten.aboBetrag != null && Number(daten.aboBetrag) > 0) {
      await preisSetzen(tx, {
        objektId: zeile.id,
        gueltigAb: heute(),
        betrag: String(daten.aboBetrag),
        bemerkung: "Beim Anlegen des Objekts erfasst.",
        erfasstVon: req.benutzer?.name ?? null,
      });
    }
    return zeile;
  });

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

  const [geaendert] = await db.transaction(async (tx) => {
    const [zeile] = await tx.update(objekte).set(daten).where(eq(objekte.id, id)).returning();

    // Der Preis am Stammblatt ist nur die Anzeige der Historie. Wer ihn
    // hier ändert, meint "ab jetzt", also wird genau das festgehalten.
    // Ohne diesen Schritt hätte die Historie eine Lücke, und ein später
    // angelegter Monat bekäme wieder den alten Betrag.
    if (
      daten.aboBetrag !== undefined &&
      String(daten.aboBetrag ?? "") !== String(vorher.aboBetrag ?? "")
    ) {
      if (daten.aboBetrag === null) {
        // Kein Preis mehr: die Historie bleibt stehen, sie ist die
        // Vergangenheit. Nur das Stammblatt ist ab jetzt leer.
      } else {
        await preisSetzen(tx, {
          objektId: id,
          gueltigAb: heute(),
          betrag: String(daten.aboBetrag),
          bemerkung: "Am Stammblatt geändert.",
          erfasstVon: req.benutzer?.name ?? null,
        });
      }
    }

    return [zeile];
  });

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

// --- Preis-Historie ------------------------------------------------------

/** Alle Preise eines Objekts, der jüngste zuoberst. */
objekteRouter.get("/:id/preise", brauchtRecht("stammdaten:lesen"), async (req, res) => {
  const id = IdSchema.parse(req.params.id);
  const [gefunden] = await db.select({ id: objekte.id }).from(objekte).where(eq(objekte.id, id));
  if (!gefunden) throw nichtGefunden("Dieses Objekt gibt es nicht.");
  res.json(await preisverlauf(id));
});

const PreisSchema = z.object({
  gueltigAb: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-TT erwartet."),
  betrag: z.union([z.string(), z.number()]),
  bemerkung: z.string().trim().max(300).nullish(),
});

/** Preis ab einem Stichtag festlegen. Auch für die Zukunft. */
objekteRouter.post("/:id/preise", brauchtRecht("stammdaten:schreiben"), async (req, res) => {
  const id = IdSchema.parse(req.params.id);
  const daten = PreisSchema.parse(req.body);

  const [gefunden] = await db.select({ id: objekte.id }).from(objekte).where(eq(objekte.id, id));
  if (!gefunden) throw nichtGefunden("Dieses Objekt gibt es nicht.");

  const betrag = Number(daten.betrag);
  if (!Number.isFinite(betrag) || betrag < 0) {
    throw new HttpFehler(422, "Der Betrag muss eine Zahl ab 0 sein.", "ungueltig");
  }

  const zeile = await db.transaction((tx) =>
    preisSetzen(tx, {
      objektId: id,
      gueltigAb: daten.gueltigAb,
      betrag: betrag.toFixed(2),
      bemerkung: daten.bemerkung ?? null,
      erfasstVon: req.benutzer?.name ?? null,
    }),
  );

  await protokolliere({
    benutzer: req.benutzer,
    aktion: "anlegen",
    tabelle: "objekt_abo",
    datensatzId: zeile?.id,
    nachher: { objektId: id, gueltigAb: daten.gueltigAb, betrag: betrag.toFixed(2) },
  });

  res.status(201).json(zeile);
});

/**
 * Einen Preiseintrag entfernen.
 *
 * Schon abgeschlossene Kalkulationsmonate bleiben davon unberührt: die
 * halten ihren Betrag selbst fest. Hier verschwindet nur der Eintrag,
 * aus dem künftige Monate ihren Preis holen.
 */
objekteRouter.delete(
  "/:id/preise/:preisId",
  brauchtRecht("stammdaten:schreiben"),
  async (req, res) => {
    const id = IdSchema.parse(req.params.id);
    const preisId = z.uuid("Ungültige Preis-ID.").parse(req.params.preisId);

    const weg = await preisLoeschen(id, preisId);
    if (!weg) throw nichtGefunden("Diesen Preiseintrag gibt es nicht.");

    await protokolliere({
      benutzer: req.benutzer,
      aktion: "loeschen",
      tabelle: "objekt_abo",
      datensatzId: preisId,
      vorher: { objektId: id, gueltigAb: weg.gueltigAb, betrag: weg.betrag },
    });

    res.status(204).end();
  },
);
