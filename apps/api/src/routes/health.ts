/**
 * Lebenszeichen der API.
 * Wird spaeter vom Deployment und vom Backup-Skript abgefragt, um zu
 * pruefen, ob der Dienst wirklich laeuft. Braucht bewusst KEINEN Login.
 */
import { Router } from "express";
import { config } from "../config.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    umgebung: config.NODE_ENV,
    zeit: new Date().toISOString(),
    laufzeitSekunden: Math.round(process.uptime()),
  });
});
