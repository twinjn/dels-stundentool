/**
 * Eingabepruefung, einmal definiert, von beiden Seiten benutzt.
 *
 * Der Server prueft, WEIL er muss: alles, was hereinkommt, ist erstmal
 * unvertrauenswuerdig. Der Browser prueft, DAMIT der Benutzer den Fehler
 * sofort sieht und nicht erst nach dem Absenden.
 *
 * Eine Definition, zwei Verwendungen. Waeren es zwei Definitionen, wuerden
 * sie irgendwann auseinanderlaufen, und dann meldet das Formular "passt",
 * waehrend der Server ablehnt.
 */
import { z } from "zod";
import { ROLLEN } from "./rollen.js";

/** Laenge schlaegt Sonderzeichen. Ein langer Satz ist besser als "P4ss!". */
export const MINDESTLAENGE_PASSWORT = 12;

/** Erst Leerzeichen weg und kleinschreiben, dann pruefen. */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Das sieht nicht nach einer E-Mail-Adresse aus."));

const passwort = z
  .string()
  .min(MINDESTLAENGE_PASSWORT, `Das Passwort braucht mindestens ${MINDESTLAENGE_PASSWORT} Zeichen.`)
  .max(200, "Das Passwort ist zu lang.");

export const AnmeldungSchema = z.object({
  email,
  // Beim Anmelden pruefen wir die Laenge NICHT. Sonst verraet die
  // Fehlermeldung, wie lang das richtige Passwort mindestens sein muss,
  // und alte Konten mit kuerzerem Passwort kaemen nicht mehr hinein.
  passwort: z.string().min(1, "Bitte Passwort eingeben.").max(200),
});
export type Anmeldung = z.infer<typeof AnmeldungSchema>;

export const BenutzerAnlegenSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt.").max(120),
  email,
  passwort,
  rolle: z.enum(ROLLEN),
});
export type BenutzerAnlegen = z.infer<typeof BenutzerAnlegenSchema>;

export const BenutzerAendernSchema = z
  .object({
    name: z.string().trim().min(1, "Name fehlt.").max(120).optional(),
    email: email.optional(),
    rolle: z.enum(ROLLEN).optional(),
    aktiv: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Es wurde nichts geändert." });
export type BenutzerAendern = z.infer<typeof BenutzerAendernSchema>;

export const PasswortAendernSchema = z.object({
  altesPasswort: z.string().min(1, "Bitte das aktuelle Passwort eingeben."),
  neuesPasswort: passwort,
});
export type PasswortAendern = z.infer<typeof PasswortAendernSchema>;
