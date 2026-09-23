/**
 * Benutzerverwaltung. Nur fuer die Rolle admin.
 *
 * Benutzer werden nie geloescht, sondern stillgelegt (aktiv = false).
 * Ein geloeschter Benutzer wuerde seine Spur im Protokoll verlieren, und
 * genau die will man bei Lohndaten behalten.
 */
import { BenutzerAendernSchema, BenutzerAnlegenSchema } from "@dels/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { brauchtRecht } from "../auth/guards.js";
import { hashePasswort } from "../auth/passwort.js";
import { alleSitzungenBeenden } from "../auth/sitzung.js";
import { db } from "../db/index.js";
import { benutzer } from "../db/schema.js";
import { HttpFehler, nichtGefunden, ungueltig } from "../fehler.js";

export const benutzerRouter = Router();

// Gilt fuer JEDE Route in dieser Datei.
benutzerRouter.use(brauchtRecht("benutzer:verwalten"));

const IdSchema = z.uuid("Ungültige Benutzer-ID.");

/** Spalten, die nach aussen gehen duerfen. Der Passwort-Hash gehoert NICHT dazu. */
const oeffentlich = {
  id: benutzer.id,
  name: benutzer.name,
  email: benutzer.email,
  rolle: benutzer.rolle,
  aktiv: benutzer.aktiv,
  erstelltAm: benutzer.erstelltAm,
  letzterLoginAm: benutzer.letzterLoginAm,
};

/**
 * Verhindert, dass sich die Firma selbst aussperrt.
 *
 * Ohne diese Pruefung genuegt ein Klick: der letzte Admin legt sich still
 * oder macht sich zu "buero", und danach kann NIEMAND mehr Benutzer
 * verwalten. Das laesst sich dann nur noch von Hand in der Datenbank
 * reparieren.
 */
async function wuerdeLetztenAdminEntfernen(id: string): Promise<boolean> {
  const [rest] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(benutzer)
    .where(and(eq(benutzer.rolle, "admin"), eq(benutzer.aktiv, true), ne(benutzer.id, id)));

  return (rest?.anzahl ?? 0) === 0;
}

benutzerRouter.get("/", async (_req, res) => {
  const liste = await db
    .select(oeffentlich)
    .from(benutzer)
    .orderBy(sql`lower(${benutzer.name})`);
  res.json(liste);
});

benutzerRouter.post("/", async (req, res) => {
  const daten = BenutzerAnlegenSchema.parse(req.body);

  const [vorhanden] = await db
    .select({ id: benutzer.id })
    .from(benutzer)
    .where(sql`lower(${benutzer.email}) = ${daten.email}`);

  if (vorhanden) {
    throw new HttpFehler(409, "Diese E-Mail-Adresse ist schon vergeben.", "email_vergeben");
  }

  const [neu] = await db
    .insert(benutzer)
    .values({
      name: daten.name,
      email: daten.email,
      rolle: daten.rolle,
      passwortHash: await hashePasswort(daten.passwort),
    })
    .returning(oeffentlich);

  res.status(201).json(neu);
});

benutzerRouter.patch("/:id", async (req, res) => {
  const id = IdSchema.parse(req.params.id);
  const daten = BenutzerAendernSchema.parse(req.body);

  const [konto] = await db.select().from(benutzer).where(eq(benutzer.id, id));
  if (!konto) throw nichtGefunden("Diesen Benutzer gibt es nicht.");

  const verliertAdminrechte =
    (daten.aktiv === false || (daten.rolle !== undefined && daten.rolle !== "admin")) &&
    konto.rolle === "admin" &&
    konto.aktiv;

  if (verliertAdminrechte && (await wuerdeLetztenAdminEntfernen(id))) {
    throw ungueltig(
      "Das ist der letzte aktive Admin. Lege zuerst einen zweiten an, sonst kann danach niemand mehr Benutzer verwalten.",
    );
  }

  if (daten.email && daten.email !== konto.email.toLowerCase()) {
    const [vorhanden] = await db
      .select({ id: benutzer.id })
      .from(benutzer)
      .where(sql`lower(${benutzer.email}) = ${daten.email}`);
    if (vorhanden) {
      throw new HttpFehler(409, "Diese E-Mail-Adresse ist schon vergeben.", "email_vergeben");
    }
  }

  const [geaendert] = await db
    .update(benutzer)
    .set(daten)
    .where(eq(benutzer.id, id))
    .returning(oeffentlich);

  // Wer stillgelegt oder heruntergestuft wird, soll nicht mit einer alten
  // Sitzung weiterarbeiten koennen.
  if (daten.aktiv === false || daten.rolle !== undefined) {
    await alleSitzungenBeenden(id);
  }

  res.json(geaendert);
});

/** Passwort fuer jemand anderen setzen, z.B. wenn es vergessen wurde. */
benutzerRouter.post("/:id/passwort", async (req, res) => {
  const id = IdSchema.parse(req.params.id);
  const { passwort } = BenutzerAnlegenSchema.pick({ passwort: true }).parse(req.body);

  const [konto] = await db.select({ id: benutzer.id }).from(benutzer).where(eq(benutzer.id, id));
  if (!konto) throw nichtGefunden("Diesen Benutzer gibt es nicht.");

  await db
    .update(benutzer)
    .set({ passwortHash: await hashePasswort(passwort) })
    .where(eq(benutzer.id, id));

  await alleSitzungenBeenden(id);
  res.status(204).end();
});
