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
import { db } from "../db/index.js";
import { benutzer } from "../db/schema.js";

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
