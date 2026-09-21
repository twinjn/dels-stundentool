/**
 * Export als Excel-Datei.
 *
 * Drei Dinge, die hier bewusst so gemacht sind:
 *
 * 1. Jede Route hat denselben Waechter wie die Ansicht, die sie
 *    exportiert. Ein Export ist keine Hintertuer an den Rechten vorbei.
 *
 * 2. Jeder Export wird protokolliert. Eine Datei mit Personendaten
 *    verlaesst damit das System nachvollziehbar. Wer sie spaeter in
 *    einem Mailanhang findet, kann herausfinden, woher sie kam.
 *
 * 3. Cache-Control: no-store. Eine Antwort mit Loehnen und AHV-Nummern
 *    hat in keinem Zwischenspeicher etwas verloren.
 */
import { Router, type Response } from "express";
import { z } from "zod";
import { brauchtRecht } from "../auth/guards.js";
import { kalkulationsmappeFuerMonat } from "../export/kalkulation.js";
import { stammdatenmappe } from "../export/stammdaten.js";
import { stundenblattFuerMonat } from "../export/stunden.js";
import { protokolliere } from "../protokoll.js";

export const exportRouter = Router();

const XLSX_TYP = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MonatSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Monat im Format JJJJ-MM erwartet.");

/**
 * Nur Zeichen, die in jedem Dateisystem und in jedem Mailprogramm
 * unfallfrei ankommen. Der Name wird ohnehin aus Monat und Zweck
 * gebildet, hier wird nur sichergestellt, dass nichts durchrutscht.
 */
function dateinameSchuetzen(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

function sendeMappe(res: Response, inhalt: Buffer, dateiname: string): void {
  const sicher = dateinameSchuetzen(dateiname);
  res.setHeader("Content-Type", XLSX_TYP);
  res.setHeader("Content-Disposition", `attachment; filename="${sicher}"`);
  res.setHeader("Content-Length", String(inhalt.length));
  res.setHeader("Cache-Control", "no-store");
  res.end(inhalt);
}

exportRouter.get("/stunden", brauchtRecht("stunden:lesen"), async (req, res) => {
  const monat = MonatSchema.parse(req.query.monat ?? "");
  const alleZeigen = req.query.alle === "true";

  const inhalt = await stundenblattFuerMonat(monat, alleZeigen);

  await protokolliere({
    benutzer: req.benutzer,
    aktion: "exportieren",
    tabelle: "eintraege",
    nachher: { export: "stunden", monat, alleMitarbeiter: alleZeigen },
  });

  sendeMappe(res, inhalt, `Stunden_${monat}.xlsx`);
});

exportRouter.get("/kalkulation", brauchtRecht("kalkulation:lesen"), async (req, res) => {
  const monat = MonatSchema.parse(req.query.monat ?? "");

  const inhalt = await kalkulationsmappeFuerMonat(`${monat}-01`);

  await protokolliere({
    benutzer: req.benutzer,
    aktion: "exportieren",
    tabelle: "kalk_monat",
    datensatzId: `${monat}-01`,
    nachher: { export: "kalkulation", monat },
  });

  sendeMappe(res, inhalt, `Kalkulation_${monat}.xlsx`);
});

exportRouter.get("/stammdaten", brauchtRecht("stammdaten:lesen"), async (req, res) => {
  const rolle = req.benutzer!.rolle;
  const inhalt = await stammdatenmappe(rolle);

  await protokolliere({
    benutzer: req.benutzer,
    aktion: "exportieren",
    tabelle: "mitarbeiter",
    // Festhalten, OB Loehne mit hinausgegangen sind. Das ist die Angabe,
    // nach der im Zweifel gefragt wird.
    nachher: { export: "stammdaten", rolle, mitLoehnen: rolle === "admin" },
  });

  const heute = new Date().toISOString().slice(0, 10);
  sendeMappe(res, inhalt, `Stammdaten_${heute}.xlsx`);
});
