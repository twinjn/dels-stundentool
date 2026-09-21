/**
 * Mitarbeiter und Objekte als Excel-Arbeitsmappe.
 *
 * WICHTIG, und der Grund, warum hier eine Rolle hineingereicht wird:
 * Stundenlohn und Monatslohn duerfen nur mit dem Recht "loehne:lesen"
 * hinaus. Ein Export ist keine Ausnahme von den Rechten, er ist die
 * gefaehrlichste Stelle dafuer: eine Datei wandert per Mail weiter,
 * waehrend eine Bildschirmansicht im Programm bleibt.
 *
 * AHV-Nummer und IBAN sind fuer beide Rollen sichtbar, so wie am
 * Bildschirm auch. Das war ein ausdruecklicher Entscheid.
 */
import { hatRecht, type Rolle } from "@dels/shared";
import { asc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { mitarbeiter, objekte } from "../db/schema.js";
import {
  alsExcelDatum,
  alsZahl,
  blatt,
  mappe,
  F_DATUM,
  F_STUNDEN,
  F_ZAHL,
} from "./arbeitsmappe.js";
import type { Zellwert } from "./arbeitsmappe.js";

export async function stammdatenmappe(rolle: Rolle): Promise<Buffer> {
  const mitLohn = hatRecht(rolle, "loehne:lesen");

  const [personen, orte] = await Promise.all([
    db
      .select()
      .from(mitarbeiter)
      .orderBy(asc(sql`${mitarbeiter.name} collate "de-CH-x-icu"`)),
    db
      .select()
      .from(objekte)
      .orderBy(asc(sql`${objekte.name} collate "de-CH-x-icu"`)),
  ]);

  const kopf: string[] = [
    "Pers.Nr",
    "Name",
    "Anrede",
    "Stufe",
    "Funktion",
    "Einsatzort",
    "Gruppe",
    "Eintritt",
    "Austritt",
    "Aktiv",
    "Soll/Tag",
    "Ferienanspruch",
    "Ferien-Saldo",
    "Saldo per",
    "Telefon",
    "Mobil",
    "E-Mail",
    "Strasse",
    "PLZ",
    "Ort",
    "Geburtsdatum",
    "Nationalitaet",
    "AHV-Nummer",
    "IBAN",
    "Notizen",
  ];
  if (mitLohn) kopf.push("Stundenlohn", "Monatslohn");

  const zeilen: Zellwert[][] = [kopf];
  for (const p of personen) {
    const zeile: Zellwert[] = [
      p.personalnummer,
      p.name,
      p.anrede,
      p.mitarbeiterstufe,
      p.funktion,
      p.einsatzort,
      p.gruppe,
      alsExcelDatum(p.eintrittsdatum),
      alsExcelDatum(p.austrittsdatum),
      p.aktiv ? "ja" : "nein",
      alsZahl(p.sollProTag),
      alsZahl(p.ferienanspruch),
      alsZahl(p.ferienSaldo),
      alsExcelDatum(p.ferienSaldoStand),
      p.telefon,
      p.mobil,
      p.email,
      p.strasse,
      p.plz,
      p.ort,
      alsExcelDatum(p.geburtsdatum),
      p.nationalitaet,
      p.ahvNummer,
      p.iban,
      p.notizen,
    ];
    if (mitLohn) zeile.push(alsZahl(p.stundenlohn), alsZahl(p.monatslohn));
    zeilen.push(zeile);
  }

  const formate: Record<number, string> = {
    7: F_DATUM,
    8: F_DATUM,
    10: F_STUNDEN,
    11: F_STUNDEN,
    12: F_STUNDEN,
    13: F_DATUM,
    20: F_DATUM,
  };
  if (mitLohn) {
    formate[25] = F_ZAHL;
    formate[26] = F_ZAHL;
  }

  const breiten = [
    10, 26, 8, 10, 18, 18, 12, 12, 12, 7, 10, 14, 13, 12, 16, 16, 26, 26, 8, 18, 13, 14, 18, 26, 30,
  ];
  if (mitLohn) breiten.push(13, 13);

  const objektzeilen: Zellwert[][] = [
    ["Objekt-Nr", "Name", "Kunde", "Strasse", "PLZ", "Ort", "Abo CHF", "Aktiv"],
  ];
  for (const o of orte) {
    objektzeilen.push([
      o.objektNr,
      o.name,
      o.kunde,
      o.strasse,
      o.plz,
      o.ort,
      alsZahl(o.aboBetrag),
      o.aktiv ? "ja" : "nein",
    ]);
  }

  return mappe([
    { name: "Mitarbeiter", blatt: blatt({ zeilen, breiten, formate, datenAb: 1 }) },
    {
      name: "Objekte",
      blatt: blatt({
        zeilen: objektzeilen,
        breiten: [12, 30, 26, 26, 8, 20, 12, 7],
        formate: { 6: F_ZAHL },
        datenAb: 1,
      }),
    },
  ]);
}
