/**
 * Wächter für Routen.
 *
 * Hier wird Sicherheit tatsächlich durchgesetzt. Alles, was das Frontend
 * macht (Knöpfe ausblenden, Seiten nicht anzeigen), ist Kosmetik. Wer die
 * Adresse kennt, schickt die Anfrage von Hand. Wenn hier kein Wächter
 * steht, ist die Route offen. Punkt.
 *
 * Regel für dieses Projekt: jede Route bekommt einen Wächter, und jeder
 * Wächter bekommt einen Test.
 */
import type { NextFunction, Request, Response } from "express";
import { hatRecht, type Recht } from "@dels/shared";
import { keinZugriff, nichtAngemeldet } from "../fehler.js";
import { COOKIE_NAME, sitzungPruefen } from "./sitzung.js";

/**
 * Liest das Cookie und hängt den Benutzer an die Anfrage, falls die
 * Sitzung gültig ist. Lehnt nichts ab, das machen die Wächter darunter.
 * Läuft für JEDE Anfrage, auch für öffentliche.
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
