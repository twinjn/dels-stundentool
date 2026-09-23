/**
 * Mitarbeiter-Stammdaten.
 *
 * Besonderheit: Lohnfelder sind nicht fuer alle sichtbar. Wer das Recht
 * "loehne:lesen" nicht hat, bekommt sie gar nicht erst geschickt.
 *
 * Wichtig ist das WO: gefiltert wird hier, im Server. Es waere verlockend,
 * alle Felder zu schicken und im Browser die Spalte auszublenden. Dann
 * staenden die Loehne aber trotzdem in der Antwort und jeder koennte sie
 * im Entwicklerwerkzeug seines Browsers lesen.
 */
import {
  LOHNFELDER,
  MitarbeiterAendernSchema,
  MitarbeiterAnlegenSchema,
  hatRecht,
} from "@dels/shared";
import { asc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { Rolle } from "@dels/shared";
import { brauchtRecht } from "../auth/guards.js";
import { db } from "../db/index.js";
import { eintraege, kalkPersonMonat, mitarbeiter } from "../db/schema.js";
import { HttpFehler, keinZugriff, nichtGefunden } from "../fehler.js";
import { protokolliere, unterschiede } from "../protokoll.js";

export const mitarbeiterRouter = Router();

const IdSchema = z.uuid("Ungueltige Mitarbeiter-ID.");

/** Felder, die jeder mit "stammdaten:lesen" sehen darf. */
const OHNE_LOHN = {
  id: mitarbeiter.id,
  name: mitarbeiter.name,
  personalnummer: mitarbeiter.personalnummer,
  mitarbeiterstufe: mitarbeiter.mitarbeiterstufe,
  funktion: mitarbeiter.funktion,
  einsatzort: mitarbeiter.einsatzort,
  gruppe: mitarbeiter.gruppe,
  anrede: mitarbeiter.anrede,
  eintrittsdatum: mitarbeiter.eintrittsdatum,
  austrittsdatum: mitarbeiter.austrittsdatum,
  aktiv: mitarbeiter.aktiv,
  lohnart: mitarbeiter.lohnart,
  ferienanspruch: mitarbeiter.ferienanspruch,
  sollProTag: mitarbeiter.sollProTag,
  telefon: mitarbeiter.telefon,
  mobil: mitarbeiter.mobil,
  email: mitarbeiter.email,
  strasse: mitarbeiter.strasse,
  plz: mitarbeiter.plz,
  ort: mitarbeiter.ort,
  geburtsdatum: mitarbeiter.geburtsdatum,
  nationalitaet: mitarbeiter.nationalitaet,
  ferienSaldo: mitarbeiter.ferienSaldo,
  ferienSaldoStand: mitarbeiter.ferienSaldoStand,
  ahvNummer: mitarbeiter.ahvNummer,
  iban: mitarbeiter.iban,
  notizen: mitarbeiter.notizen,
  erstelltAm: mitarbeiter.erstelltAm,
};

const MIT_LOHN = {
  ...OHNE_LOHN,
  stundenlohn: mitarbeiter.stundenlohn,
  monatslohn: mitarbeiter.monatslohn,
};

function spaltenFuer(rolle: Rolle) {
  return hatRecht(rolle, "loehne:lesen") ? MIT_LOHN : OHNE_LOHN;
}

/**
 * Wer keine Loehne sehen darf, darf sie auch nicht setzen.
 * Bewusst ein Fehler statt stillem Weglassen: sonst klickt jemand
 * "Speichern", bekommt "gespeichert" zu sehen, und der Wert ist nicht da.
 */
function lohnfelderPruefen(rumpf: Record<string, unknown>, rolle: Rolle): void {
  if (hatRecht(rolle, "loehne:schreiben")) return;

  const verbotene = LOHNFELDER.filter((feld) => feld in rumpf);
  if (verbotene.length > 0) {
    throw keinZugriff(`Lohnfelder (${verbotene.join(", ")}) darf deine Rolle nicht aendern.`);
  }
}

mitarbeiterRouter.get("/", brauchtRecht("stammdaten:lesen"), async (req, res) => {
  const nurAktive = req.query.nurAktive === "true";

  const abfrage = db.select(spaltenFuer(req.benutzer!.rolle)).from(mitarbeiter);
  const liste = nurAktive
    ? await abfrage.where(eq(mitarbeiter.aktiv, true)).orderBy(asc(sql`lower(${mitarbeiter.name})`))
    : await abfrage.orderBy(asc(sql`lower(${mitarbeiter.name})`));

  res.json(liste);
});

mitarbeiterRouter.get("/:id", brauchtRecht("stammdaten:lesen"), async (req, res) => {
  const id = IdSchema.parse(req.params.id);

  const [gefunden] = await db
    .select(spaltenFuer(req.benutzer!.rolle))
    .from(mitarbeiter)
    .where(eq(mitarbeiter.id, id));

  if (!gefunden) throw nichtGefunden("Diesen Mitarbeiter gibt es nicht.");
  res.json(gefunden);
});

mitarbeiterRouter.post("/", brauchtRecht("stammdaten:schreiben"), async (req, res) => {
  lohnfelderPruefen(req.body as Record<string, unknown>, req.benutzer!.rolle);
  const daten = MitarbeiterAnlegenSchema.parse(req.body);

  const [neu] = await db
    .insert(mitarbeiter)
    .values(daten)
    .returning(spaltenFuer(req.benutzer!.rolle));

  await protokolliere({
    benutzer: req.benutzer,
    aktion: "anlegen",
    tabelle: "mitarbeiter",
    datensatzId: neu?.id,
    nachher: daten,
  });

  res.status(201).json(neu);
});

mitarbeiterRouter.patch("/:id", brauchtRecht("stammdaten:schreiben"), async (req, res) => {
  const id = IdSchema.parse(req.params.id);
  lohnfelderPruefen(req.body as Record<string, unknown>, req.benutzer!.rolle);
  const daten = MitarbeiterAendernSchema.parse(req.body);

  const [vorher] = await db.select().from(mitarbeiter).where(eq(mitarbeiter.id, id));
  if (!vorher) throw nichtGefunden("Diesen Mitarbeiter gibt es nicht.");

  const [geaendert] = await db
    .update(mitarbeiter)
    .set(daten)
    .where(eq(mitarbeiter.id, id))
    .returning(spaltenFuer(req.benutzer!.rolle));

  const diff = unterschiede(vorher as Record<string, unknown>, daten);
  await protokolliere({
    benutzer: req.benutzer,
    aktion: "aendern",
    tabelle: "mitarbeiter",
    datensatzId: id,
    vorher: diff.vorher,
    nachher: diff.nachher,
  });

  res.json(geaendert);
});

/**
 * Loeschen geht nur, solange nichts daran haengt.
 *
 * Sobald Stunden oder Kalkulationszeilen vorliegen, verweigert schon die
 * Datenbank das Loeschen (Fremdschluessel auf RESTRICT). Wir fangen das
 * vorher ab, um eine verstaendliche Meldung zu geben statt eines
 * Datenbankfehlers, und weisen auf den richtigen Weg hin: stilllegen.
 */
mitarbeiterRouter.delete("/:id", brauchtRecht("stammdaten:schreiben"), async (req, res) => {
  const id = IdSchema.parse(req.params.id);

  const [vorher] = await db.select().from(mitarbeiter).where(eq(mitarbeiter.id, id));
  if (!vorher) throw nichtGefunden("Diesen Mitarbeiter gibt es nicht.");

  const [{ anzahl: stunden } = { anzahl: 0 }] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(eintraege)
    .where(eq(eintraege.mitarbeiterId, id));

  const [{ anzahl: kalk } = { anzahl: 0 }] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(kalkPersonMonat)
    .where(eq(kalkPersonMonat.mitarbeiterId, id));

  if (stunden > 0 || kalk > 0) {
    throw new HttpFehler(
      409,
      `Zu diesem Mitarbeiter gibt es ${stunden} Eintraege und ${kalk} Kalkulationszeilen. ` +
        "Lohndaten werden nicht geloescht. Lege den Mitarbeiter stattdessen still.",
      "hat_daten",
    );
  }

  await db.delete(mitarbeiter).where(eq(mitarbeiter.id, id));

  await protokolliere({
    benutzer: req.benutzer,
    aktion: "loeschen",
    tabelle: "mitarbeiter",
    datensatzId: id,
    vorher: { name: vorher.name, personalnummer: vorher.personalnummer },
  });

  res.status(204).end();
});
