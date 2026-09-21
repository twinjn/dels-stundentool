/**
 * Anmelden, abmelden, eigenes Passwort aendern.
 */
import { AnmeldungSchema, PasswortAendernSchema } from "@dels/shared";
import { eq, sql } from "drizzle-orm";
import { Router } from "express";
import {
  darfVersuchen,
  schluesselFuer,
  versuchGelungen,
  versuchGescheitert,
} from "../auth/anmeldeschutz.js";
import { cookieLoeschOptionen, cookieOptionen } from "../auth/cookie.js";
import { angemeldet } from "../auth/guards.js";
import { hashePasswort, passwortStimmt, verbrauchePruefzeit } from "../auth/passwort.js";
import {
  COOKIE_NAME,
  abgelaufeneAufraeumen,
  alleSitzungenBeenden,
  sitzungAnlegen,
  sitzungBeenden,
} from "../auth/sitzung.js";
import { db } from "../db/index.js";
import { benutzer } from "../db/schema.js";
import { HttpFehler, ungueltig } from "../fehler.js";

export const authRouter = Router();

/**
 * Immer dieselbe Meldung, egal ob die E-Mail unbekannt ist, das Passwort
 * falsch oder das Konto stillgelegt. Wer hier unterscheidet, verraet
 * Angreifern, welche Adressen ueberhaupt ein Konto haben.
 */
const ABGELEHNT = "E-Mail oder Passwort stimmt nicht.";

authRouter.post("/anmelden", async (req, res) => {
  const daten = AnmeldungSchema.parse(req.body);

  const ip = req.ip ?? "unbekannt";
  const schluessel = schluesselFuer(ip, daten.email);

  const pruefung = darfVersuchen(schluessel);
  if (!pruefung.erlaubt) {
    throw new HttpFehler(
      429,
      `Zu viele Versuche. Bitte ${Math.ceil(pruefung.sekunden / 60)} Minuten warten.`,
      "zu_viele_versuche",
    );
  }

  const [konto] = await db
    .select()
    .from(benutzer)
    .where(sql`lower(${benutzer.email}) = ${daten.email}`);

  if (!konto) {
    // Trotzdem rechnen, damit die Antwort genauso lange dauert wie bei
    // einem existierenden Konto. Siehe auth/passwort.ts.
    await verbrauchePruefzeit(daten.passwort);
    versuchGescheitert(schluessel);
    throw new HttpFehler(401, ABGELEHNT, "anmeldung_fehlgeschlagen");
  }

  const stimmt = await passwortStimmt(konto.passwortHash, daten.passwort);

  if (!stimmt || !konto.aktiv) {
    versuchGescheitert(schluessel);
    throw new HttpFehler(401, ABGELEHNT, "anmeldung_fehlgeschlagen");
  }

  versuchGelungen(schluessel);

  const token = await sitzungAnlegen(konto.id, {
    ip,
    browser: req.get("user-agent") ?? undefined,
  });

  await db.update(benutzer).set({ letzterLoginAm: new Date() }).where(eq(benutzer.id, konto.id));

  // Gelegenheit nutzen: alte Sitzungen wegraeumen, damit die Tabelle
  // nicht unbegrenzt waechst. Ein eigener Zeitplan waere hier Overkill.
  await abgelaufeneAufraeumen();

  res.cookie(COOKIE_NAME, token, cookieOptionen());
  res.json({
    id: konto.id,
    name: konto.name,
    email: konto.email,
    rolle: konto.rolle,
  });
});

authRouter.post("/abmelden", async (req, res) => {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  if (typeof token === "string" && token.length > 0) {
    await sitzungBeenden(token);
  }
  res.clearCookie(COOKIE_NAME, cookieLoeschOptionen());
  res.status(204).end();
});

/** Wer bin ich. Das Frontend fragt das beim Laden, um den Zustand zu kennen. */
authRouter.get("/ich", angemeldet, (req, res) => {
  res.json(req.benutzer);
});

authRouter.post("/passwort", angemeldet, async (req, res) => {
  const daten = PasswortAendernSchema.parse(req.body);
  const ich = req.benutzer;
  if (!ich) throw new HttpFehler(401, "Nicht angemeldet.", "nicht_angemeldet");

  const [konto] = await db.select().from(benutzer).where(eq(benutzer.id, ich.id));
  if (!konto) throw new HttpFehler(401, "Nicht angemeldet.", "nicht_angemeldet");

  if (!(await passwortStimmt(konto.passwortHash, daten.altesPasswort))) {
    throw ungueltig("Das aktuelle Passwort stimmt nicht.");
  }

  await db
    .update(benutzer)
    .set({ passwortHash: await hashePasswort(daten.neuesPasswort) })
    .where(eq(benutzer.id, ich.id));

  // Nach einer Passwortaenderung fliegen ALLE Sitzungen raus, auch die
  // eigene. Genau dafuer aendert man ja oft das Passwort: weil jemand
  // anders vielleicht noch angemeldet ist.
  await alleSitzungenBeenden(ich.id);
  res.clearCookie(COOKIE_NAME, cookieLoeschOptionen());

  res.status(204).end();
});
