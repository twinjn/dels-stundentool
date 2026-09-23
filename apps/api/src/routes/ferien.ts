/**
 * Ferienstand und Uebertraege.
 *
 * RECHTE, und warum sie hier auseinanderfallen:
 *
 * Den Stand in Tagen darf sehen, wer Stammdaten sehen darf. Das ist
 * Alltag im Buero: wer plant, wer noch Tage offen hat, wer im Dezember
 * gemahnt werden muss.
 *
 * Die Ferienentschaedigung der Stundenloehner ist dagegen ein
 * Frankenbetrag aus Stundenlohn mal Stunden. Das IST eine Lohnzahl,
 * auch wenn sie unter "Ferien" steht, und sie wird nur mitgeschickt,
 * wenn die Rolle Loehne sehen darf. Ein Recht danach zu vergeben, wo
 * eine Zahl in der Oberflaeche steht, statt danach, was sie verraet,
 * ist ein Klassiker unter den Datenlecks.
 */
import { Router } from "express";
import { z } from "zod";
import { hatRecht } from "@dels/shared";
import { brauchtRecht } from "../auth/guards.js";
import { db } from "../db/index.js";
import { ferienUebertrag, mitarbeiter } from "../db/schema.js";
import { HttpFehler, nichtGefunden } from "../fehler.js";
import { ferienstand, type FerienZeile } from "../ferien/saldo.js";
import { protokolliere } from "../protokoll.js";
import { and, eq } from "drizzle-orm";

export const ferienRouter = Router();

const JahrSchema = z.coerce
  .number()
  .int()
  .min(2000, "Jahr ab 2000 erwartet.")
  .max(2100, "Jahr bis 2100 erwartet.");

const UebertragSchema = z.object({
  tage: z
    .number()
    .min(-100, "Hoechstens 100 Tage Minus.")
    .max(100, "Hoechstens 100 Tage.")
    // Ferien gibt es halbtagsweise, nicht in Minuten.
    .refine((v) => Number.isInteger(v * 2), "Nur ganze oder halbe Tage."),
  bemerkung: z
    .string()
    .trim()
    .min(3, "Begruendung angeben, sonst weiss in einem Jahr niemand mehr warum.")
    .max(500),
});

/**
 * Entfernt die Frankenbetraege, wenn die Rolle keine Loehne sehen darf.
 * Die Tage bleiben, die sind kein Geheimnis.
 */
function ohneLohnzahlen(zeile: FerienZeile): FerienZeile {
  if (zeile.art !== "stunde") return zeile;
  return { ...zeile, basis: null, entschaedigung: null };
}

ferienRouter.get("/", brauchtRecht("stammdaten:lesen"), async (req, res) => {
  const jahr = JahrSchema.parse(req.query.jahr ?? new Date().getUTCFullYear());
  const zeilen = await ferienstand(jahr);

  const darfLoehne = hatRecht(req.benutzer!.rolle, "loehne:lesen");

  res.json({
    jahr,
    darfLoehne,
    zeilen: darfLoehne ? zeilen : zeilen.map(ohneLohnzahlen),
  });
});

/**
 * Uebertrag von Hand setzen, also die gerechnete Zahl uebersteuern.
 *
 * Braucht stammdaten:schreiben, nicht loehne:schreiben: es geht um Tage.
 * Und es wird protokolliert, weil hier jemandem Ferien weggenommen oder
 * gegeben werden koennen.
 */
ferienRouter.put(
  "/:mitarbeiterId/:jahr",
  brauchtRecht("stammdaten:schreiben"),
  async (req, res) => {
    const mitarbeiterId = z.uuid("Keine gueltige Mitarbeiter-ID.").parse(req.params.mitarbeiterId);
    const jahr = JahrSchema.parse(req.params.jahr);
    const daten = UebertragSchema.parse(req.body);

    const [person] = await db
      .select({ id: mitarbeiter.id, name: mitarbeiter.name, lohnart: mitarbeiter.lohnart })
      .from(mitarbeiter)
      .where(eq(mitarbeiter.id, mitarbeiterId));

    if (!person) throw nichtGefunden("Diesen Mitarbeiter gibt es nicht.");

    // Ein Uebertrag in Tagen fuer jemanden im Stundenlohn ergibt keinen
    // Sinn: dort sind die Ferien mit jedem Lohn bezahlt. Lieber hier
    // ablehnen als eine Zahl fuehren, die nie jemand anschaut.
    if (person.lohnart !== "monat") {
      throw new HttpFehler(
        422,
        `${person.name} ist im Stundenlohn. Dort wird die Ferienentschaedigung ` +
          "mit dem Lohn ausbezahlt, einen Uebertrag in Tagen gibt es nicht.",
        "falsche_lohnart",
      );
    }

    const [vorher] = await db
      .select()
      .from(ferienUebertrag)
      .where(and(eq(ferienUebertrag.mitarbeiterId, mitarbeiterId), eq(ferienUebertrag.jahr, jahr)));

    const werte = {
      mitarbeiterId,
      jahr,
      tage: daten.tage.toFixed(2),
      bemerkung: daten.bemerkung,
      erfasstVon: req.benutzer?.name ?? null,
    };

    const [nachher] = await db
      .insert(ferienUebertrag)
      .values(werte)
      .onConflictDoUpdate({
        target: [ferienUebertrag.mitarbeiterId, ferienUebertrag.jahr],
        set: { tage: werte.tage, bemerkung: werte.bemerkung, erfasstVon: werte.erfasstVon },
      })
      .returning();

    await protokolliere({
      benutzer: req.benutzer,
      aktion: vorher ? "aendern" : "anlegen",
      tabelle: "ferien_uebertrag",
      datensatzId: nachher!.id,
      vorher: vorher ?? null,
      nachher,
    });

    res.json(nachher);
  },
);

/** Gesetzten Uebertrag wieder entfernen, damit wieder gerechnet wird. */
ferienRouter.delete(
  "/:mitarbeiterId/:jahr",
  brauchtRecht("stammdaten:schreiben"),
  async (req, res) => {
    const mitarbeiterId = z.uuid("Keine gueltige Mitarbeiter-ID.").parse(req.params.mitarbeiterId);
    const jahr = JahrSchema.parse(req.params.jahr);

    const [weg] = await db
      .delete(ferienUebertrag)
      .where(and(eq(ferienUebertrag.mitarbeiterId, mitarbeiterId), eq(ferienUebertrag.jahr, jahr)))
      .returning();

    if (!weg) throw nichtGefunden("Fuer dieses Jahr ist kein Uebertrag gesetzt.");

    await protokolliere({
      benutzer: req.benutzer,
      aktion: "loeschen",
      tabelle: "ferien_uebertrag",
      datensatzId: weg.id,
      vorher: weg,
      nachher: null,
    });

    res.status(204).end();
  },
);
