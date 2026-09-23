/**
 * Gemeinsame Hilfen fuer Tests.
 *
 * Liegt in src/test/ und ist in der tsconfig vom Bau ausgenommen: diese
 * Datei soll niemals in der ausgelieferten Anwendung landen. Sie legt
 * Benutzer an und meldet sie an, das gehoert nicht in Produktion.
 */
import type { Express } from "express";
import request from "supertest";
import type { Rolle } from "@dels/shared";
import { hashePasswort } from "../auth/passwort.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { benutzer } from "../db/schema.js";

/**
 * Schutz davor, Tests gegen die falsche Datenbank laufen zu lassen.
 *
 * Die Tests legen Benutzer an, aendern Stammdaten und raeumen hinterher
 * auf. In einer Produktivdatenbank ist das eine Katastrophe, und ein
 * vertippter oder vergessener DATABASE_URL ist schnell passiert.
 *
 * Deshalb laufen sie nur gegen eine Datenbank, deren Name sie als
 * Spielwiese ausweist. Wer es trotzdem will, muss es ausdruecklich sagen:
 *   TESTS_GEGEN_DIESE_DB=ja npm test
 */
function pruefeDatenbank(): void {
  if (process.env.TESTS_GEGEN_DIESE_DB === "ja") return;

  const url = config.DATABASE_URL;
  const name = url.split("/").pop()?.split("?")[0] ?? "";

  if (/test|probe|dev|lokal/i.test(name)) return;

  throw new Error(
    `\nDie Tests wuerden gegen die Datenbank "${name}" laufen.\n` +
      "Das sieht nicht nach einer Testdatenbank aus, und die Tests legen\n" +
      "Daten an und löschen sie wieder.\n\n" +
      "Entweder DATABASE_URL auf eine Datenbank mit test, dev oder probe\n" +
      "im Namen zeigen lassen, oder, wenn es wirklich gewollt ist:\n" +
      "  TESTS_GEGEN_DIESE_DB=ja npm test\n",
  );
}

pruefeDatenbank();

export const TESTPASSWORT = "ein-langes-testpasswort";

/** Eindeutiger Namensraum pro Testdatei, damit sich Laeufe nicht stoeren. */
export function markeErzeugen(vorsilbe: string): string {
  return `${vorsilbe}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function benutzerAnlegen(name: string, email: string, rolle: Rolle): Promise<string> {
  const [zeile] = await db
    .insert(benutzer)
    .values({ name, email, rolle, passwortHash: await hashePasswort(TESTPASSWORT) })
    .returning({ id: benutzer.id });

  if (!zeile) throw new Error("Testbenutzer konnte nicht angelegt werden.");
  return zeile.id;
}

/** Meldet sich an und liefert einen Klienten, der das Cookie behaelt. */
export async function anmelden(app: Express, email: string) {
  const klient = request.agent(app);
  const antwort = await klient.post("/api/auth/anmelden").send({ email, passwort: TESTPASSWORT });

  if (antwort.status !== 200) {
    throw new Error(`Anmeldung als ${email} fehlgeschlagen: ${antwort.status}`);
  }
  return klient;
}
