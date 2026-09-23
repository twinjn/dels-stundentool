/**
 * Sitzungen (Sessions).
 *
 * Ablauf einer Anmeldung:
 *  1. Wir würfeln ein Token aus 32 zufälligen Bytes.
 *  2. In die Datenbank kommt nur der SHA-256-HASH davon.
 *  3. Das Klartext-Token geht als Cookie an den Browser.
 *
 * Warum der Umweg über den Hash: wer irgendwie an die Datenbank kommt
 * (Backup auf einem USB-Stick, geleakter Dump, neugieriger Praktikant),
 * kann sich damit trotzdem NICHT anmelden. Aus dem Hash lässt sich das
 * Token nicht zurückrechnen.
 *
 * Hier reicht SHA-256, anders als bei Passwörtern. Der Unterschied: ein
 * Token hat 256 Bit echten Zufall, ein Passwort hat vielleicht 30 Bit.
 * Zufall in dieser Grössenordnung kann niemand durchprobieren, also
 * braucht es kein absichtlich langsames Verfahren.
 */
import crypto from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Rolle } from "@dels/shared";
import { db } from "../db/index.js";
import { benutzer, sitzungen } from "../db/schema.js";

export const COOKIE_NAME = "dels_sitzung";

/** Wie lange eine Sitzung ohne Aktivität gültig bleibt. */
const GUELTIG_TAGE = 7;

/**
 * Verlängert wird erst, wenn seit der letzten Aktivität mehr als eine
 * Stunde vergangen ist. Sonst schriebe jede einzelne Anfrage in die
 * Datenbank, nur um eine Uhrzeit um ein paar Sekunden zu aktualisieren.
 */
const VERLAENGERN_AB_MS = 60 * 60 * 1000;

export type AngemeldeterBenutzer = {
  id: string;
  name: string;
  email: string;
  rolle: Rolle;
};

function hashe(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function ablaufAb(zeitpunkt: Date): Date {
  return new Date(zeitpunkt.getTime() + GUELTIG_TAGE * 24 * 60 * 60 * 1000);
}

/** Legt eine Sitzung an und liefert das Klartext-Token zurueck. */
export async function sitzungAnlegen(
  benutzerId: string,
  kontext: { ip?: string | undefined; browser?: string | undefined } = {},
): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");

  await db.insert(sitzungen).values({
    id: hashe(token),
    benutzerId,
    laeuftAbAm: ablaufAb(new Date()),
    ip: kontext.ip ?? null,
    browser: kontext.browser?.slice(0, 255) ?? null,
  });

  return token;
}

/**
 * Prüft ein Token und liefert den dazugehörenden Benutzer.
 * Gibt null zurück, wenn die Sitzung unbekannt, abgelaufen oder das
 * Konto stillgelegt ist.
 */
export async function sitzungPruefen(token: string): Promise<AngemeldeterBenutzer | null> {
  const id = hashe(token);

  const [zeile] = await db
    .select({
      laeuftAbAm: sitzungen.laeuftAbAm,
      letzteAktivitaet: sitzungen.letzteAktivitaet,
      id: benutzer.id,
      name: benutzer.name,
      email: benutzer.email,
      rolle: benutzer.rolle,
      aktiv: benutzer.aktiv,
    })
    .from(sitzungen)
    .innerJoin(benutzer, eq(sitzungen.benutzerId, benutzer.id))
    .where(eq(sitzungen.id, id));

  if (!zeile) return null;

  const jetzt = new Date();

  if (zeile.laeuftAbAm <= jetzt) {
    await db.delete(sitzungen).where(eq(sitzungen.id, id));
    return null;
  }

  // Ein stillgelegtes Konto fliegt sofort raus, auch mit gültigem Token.
  // Sonst bliebe ein entlassener Mitarbeiter noch sieben Tage drin.
  if (!zeile.aktiv) {
    await db.delete(sitzungen).where(eq(sitzungen.id, id));
    return null;
  }

  if (jetzt.getTime() - zeile.letzteAktivitaet.getTime() > VERLAENGERN_AB_MS) {
    await db
      .update(sitzungen)
      .set({ letzteAktivitaet: jetzt, laeuftAbAm: ablaufAb(jetzt) })
      .where(eq(sitzungen.id, id));
  }

  return { id: zeile.id, name: zeile.name, email: zeile.email, rolle: zeile.rolle };
}

export async function sitzungBeenden(token: string): Promise<void> {
  await db.delete(sitzungen).where(eq(sitzungen.id, hashe(token)));
}

/** Meldet einen Benutzer auf allen Geräten ab. */
export async function alleSitzungenBeenden(benutzerId: string): Promise<void> {
  await db.delete(sitzungen).where(eq(sitzungen.benutzerId, benutzerId));
}

/** Räumt abgelaufene Sitzungen weg. Wird beim Anmelden nebenbei erledigt. */
export async function abgelaufeneAufraeumen(): Promise<void> {
  await db.delete(sitzungen).where(lt(sitzungen.laeuftAbAm, new Date()));
}
