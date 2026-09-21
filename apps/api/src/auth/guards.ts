/**
 * Waechter fuer Routen.
 *
 * Hier wird Sicherheit tatsaechlich durchgesetzt. Alles, was das Frontend
 * macht (Knoepfe ausblenden, Seiten nicht anzeigen), ist Kosmetik. Wer die
 * Adresse kennt, schickt die Anfrage von Hand. Wenn hier kein Waechter
 * steht, ist die Route offen. Punkt.
 *
 * Regel fuer dieses Projekt: jede Route bekommt einen Waechter, und jeder
 * Waechter bekommt einen Test.
 */
import type { NextFunction, Request, Response } from "express";
import { hatRecht, type Recht } from "@dels/shared";
import { keinZugriff, nichtAngemeldet } from "../fehler.js";
import { COOKIE_NAME, sitzungPruefen } from "./sitzung.js";

/**
 * Liest das Cookie und haengt den Benutzer an die Anfrage, falls die
 * Sitzung gueltig ist. Lehnt nichts ab, das machen die Waechter darunter.
 * Laeuft fuer JEDE Anfrage, auch fuer oeffentliche.
 */
export async function sitzungLesen(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token: unknown = req.cookies?.[COOKIE_NAME];

  if (typeof token === "string" && token.length > 0) {
    const gefunden = await sitzungPruefen(token);
    if (gefunden) req.benutzer = gefunden;
  }

  next();
}

/** Nur angemeldete Benutzer. */
export function angemeldet(req: Request, _res: Response, next: NextFunction): void {
  if (!req.benutzer) {
    next(nichtAngemeldet());
    return;
  }
  next();
}

/**
 * Nur Benutzer mit einem bestimmten Recht.
 * Beispiel: router.get("/loehne", brauchtRecht("loehne:lesen"), ...)
 */
export function brauchtRecht(recht: Recht) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.benutzer) {
      next(nichtAngemeldet());
      return;
    }

    if (!hatRecht(req.benutzer.rolle, recht)) {
      next(
        keinZugriff(`Fuer "${recht}" fehlt deiner Rolle (${req.benutzer.rolle}) die Berechtigung.`),
      );
      return;
    }

    next();
  };
}
