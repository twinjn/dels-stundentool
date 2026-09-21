/**
 * Einheitliche Fehlerbehandlung.
 *
 * Ziel: jede Route wirft einfach einen Fehler, und genau eine Stelle
 * entscheidet, was der Browser davon zu sehen bekommt. Ohne das streut
 * man res.status(400).json(...) ueber hundert Stellen und jede sieht
 * ein bisschen anders aus.
 */
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { istProduktion } from "./config.js";

/** Ein Fehler, den wir bewusst ausloesen und dem Benutzer zeigen wollen. */
export class HttpFehler extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, nachricht: string, code = "fehler") {
    super(nachricht);
    this.name = "HttpFehler";
    this.status = status;
    this.code = code;
  }
}

export const nichtAngemeldet = (n = "Nicht angemeldet.") =>
  new HttpFehler(401, n, "nicht_angemeldet");
export const keinZugriff = (n = "Dafuer fehlt dir die Berechtigung.") =>
  new HttpFehler(403, n, "kein_zugriff");
export const nichtGefunden = (n = "Nicht gefunden.") => new HttpFehler(404, n, "nicht_gefunden");
export const ungueltig = (n = "Eingabe ist ungueltig.") => new HttpFehler(400, n, "ungueltig");

/** Greift, wenn keine Route gepasst hat. Muss VOR fehlerBehandlung stehen. */
export function routeNichtGefunden(req: Request, _res: Response, next: NextFunction): void {
  next(new HttpFehler(404, `Route ${req.method} ${req.path} gibt es nicht.`, "route_unbekannt"));
}

/**
 * Der zentrale Fehler-Handler. Express erkennt ihn an den VIER Parametern,
 * deshalb muss "next" hier stehen bleiben, auch wenn er ungenutzt ist.
 */
export function fehlerBehandlung(
  fehler: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Eingabefehler aus Zod: sagen wir dem Benutzer genau, welches Feld klemmt.
  if (fehler instanceof ZodError) {
    res.status(400).json({
      code: "ungueltig",
      nachricht: "Eingabe ist ungueltig.",
      felder: fehler.issues.map((i) => ({ feld: i.path.join("."), problem: i.message })),
    });
    return;
  }

  if (fehler instanceof HttpFehler) {
    res.status(fehler.status).json({ code: fehler.code, nachricht: fehler.message });
    return;
  }

  // Alles Uebrige ist ein Programmierfehler. Der Benutzer bekommt nur eine
  // neutrale Meldung, die Details landen im Server-Log. Sonst verraet man
  // Angreifern Tabellennamen, Pfade und Bibliotheksversionen.
  console.error("Unerwarteter Fehler:", fehler);
  res.status(500).json({
    code: "serverfehler",
    nachricht: "Es ist ein unerwarteter Fehler aufgetreten.",
    ...(istProduktion ? {} : { detail: fehler instanceof Error ? fehler.message : String(fehler) }),
  });
}
