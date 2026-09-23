/**
 * Lebenszeichen der API.
 * Wird später vom Deployment und vom Backup-Skript abgefragt, um zu
 * prüfen, ob der Dienst wirklich laeuft. Braucht bewusst KEINEN Login.
 *
 * Die Datenbank wird mitgeprüft: eine API, die zwar antwortet, aber
 * keine Datenbank hat, ist für den Benutzer genauso kaputt wie eine,
 * die gar nicht laeuft. "Grün" soll heissen "funktioniert wirklich".
 */
import { Router } from "express";
import { config } from "../config.js";
import { datenbankErreichbar } from "../db/index.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const datenbank = await datenbankErreichbar();

  res.status(datenbank ? 200 : 503).json({
    status: datenbank ? "ok" : "datenbank_weg",
    datenbank,
    umgebung: config.NODE_ENV,
    zeit: new Date().toISOString(),
    laufzeitSekunden: Math.round(process.uptime()),
  });
});
