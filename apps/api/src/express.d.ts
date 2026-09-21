/**
 * Erweitert den Typ von Express' Request um unser eigenes Feld.
 *
 * Ohne das wuesste TypeScript nichts von req.benutzer und wir muessten
 * ueberall mit "as any" arbeiten, also genau die Typsicherheit wegwerfen,
 * wegen der wir TypeScript benutzen.
 */
import type { AngemeldeterBenutzer } from "./auth/sitzung.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Gesetzt von der Middleware sitzungLesen, wenn die Sitzung gilt. */
      benutzer?: AngemeldeterBenutzer;
    }
  }
}

export {};
