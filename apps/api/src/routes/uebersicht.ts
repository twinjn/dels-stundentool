/**
 * Jahresuebersicht je Mitarbeiter.
 *
 * Bewusst KEINE Lohnzahlen: hier geht es um Zeit. Wer Löhne sehen will,
 * geht in die Kalkulation, und dafür braucht es ein anderes Recht.
 */
import { Router } from "express";
import { z } from "zod";
import { brauchtRecht } from "../auth/guards.js";
import { jahresuebersicht } from "../uebersicht/jahr.js";

export const uebersichtRouter = Router();

const JahrSchema = z.coerce
  .number()
  .int()
  .min(2000, "Jahr ab 2000 erwartet.")
  .max(2100, "Jahr bis 2100 erwartet.");

uebersichtRouter.get("/", brauchtRecht("stunden:lesen"), async (req, res) => {
  const jahr = JahrSchema.parse(req.query.jahr ?? new Date().getUTCFullYear());
  const alleZeigen = req.query.alle === "true";
  res.json(await jahresuebersicht(jahr, alleZeigen));
});
