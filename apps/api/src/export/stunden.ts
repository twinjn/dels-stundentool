/**
 * Das Monatsblatt als Excel-Datei.
 *
 * Aufbau wie am Bildschirm und wie im gewohnten Excel: eine Zeile je
 * Person mit ihren Abwesenheiten, darunter je eine Zeile pro Objekt mit
 * den Stunden, Tage als Spalten.
 *
 * Die Stunden stehen als echte Zahlen in den Zellen, nicht als Text.
 * Sonst kann im Export niemand eine Spalte markieren und unten die Summe
 * ablesen, und genau dafuer exportiert man eine Tabelle.
 */
import { KUERZEL, type Eintragsart } from "@dels/shared";
import { monatsraster, type Monatsraster } from "../stunden/raster.js";
import { blatt, mappe, F_STUNDEN, type Zellwert } from "./arbeitsmappe.js";

const MONATSNAMEN = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function monatTitel(monat: string): string {
  const [jahr, nr] = monat.split("-");
  const name = MONATSNAMEN[Number(nr) - 1];
  return name ? `${name} ${jahr}` : monat;
}

/** Zeitpunkt in Schweizer Ortszeit, damit im Blatt nicht UTC steht. */
export function jetztInZuerich(zeitpunkt: Date = new Date()): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "short",
    timeStyle: "short",
  }).format(zeitpunkt);
}

function objektbezeichnung(objektNr: string | null, name: string): string {
  return objektNr ? `${objektNr} ${name}` : name;
}

export function stundenblatt(raster: Monatsraster, erstelltAm = jetztInZuerich()): Buffer {
  const tage = raster.tage;

  const zeilen: Zellwert[][] = [];
  zeilen.push([`Stundenkontrolle ${monatTitel(raster.monat)}`]);
  zeilen.push([`Erstellt am ${erstelltAm}`]);
  zeilen.push([]);

  zeilen.push([
    "Pers.Nr",
    "Name",
    "Objekt",
    ...tage.map((t) => t.wochentag),
    "Arbeit",
    "Ferien",
    "Krankheit",
    "Unfall",
    "Feiertag",
    "Sonstiges",
  ]);
  zeilen.push([
    "",
    "",
    "",
    ...tage.map((t) => t.tag),
    "Std",
    "Tage",
    "Tage",
    "Tage",
    "Tage",
    "Tage",
  ]);

  const datenAb = zeilen.length;

  for (const person of raster.mitarbeiter) {
    zeilen.push([
      person.personalnummer,
      person.aktiv ? person.name : `${person.name} (ausgetreten)`,
      "Abwesenheiten",
      ...tage.map((t) => {
        const art = person.abwesenheiten[t.datum];
        return art ? (KUERZEL[art as Eintragsart] ?? art) : null;
      }),
      person.summen.arbeit,
      person.summen.ferien,
      person.summen.krankheit,
      person.summen.unfall,
      person.summen.feiertag,
      person.summen.sonstiges,
    ]);

    for (const objekt of person.objekte) {
      let zeilensumme = 0;
      const felder = tage.map((t): Zellwert => {
        const zelle = objekt.tage[t.datum];
        if (!zelle) return null;
        if (zelle.art === "arbeit") {
          const stunden = Number(zelle.wert);
          zeilensumme += stunden;
          return stunden;
        }
        return KUERZEL[zelle.art as Eintragsart] ?? zelle.art;
      });

      zeilen.push([
        "",
        "",
        objektbezeichnung(objekt.objektNr, objekt.name),
        ...felder,
        zeilensumme,
        null,
        null,
        null,
        null,
        null,
      ]);
    }
  }

  const spalten = 3 + tage.length + 6;
  const formate: Record<number, string> = {};
  for (let i = 3; i < spalten; i++) formate[i] = F_STUNDEN;

  const breiten = [10, 26, 30, ...tage.map(() => 5), 9, 8, 10, 8, 9, 10];

  return mappe([
    {
      name: `Stunden ${raster.monat}`,
      blatt: blatt({ zeilen, breiten, formate, datenAb }),
    },
  ]);
}

export async function stundenblattFuerMonat(monat: string, alleZeigen: boolean): Promise<Buffer> {
  return stundenblatt(await monatsraster(monat, alleZeigen));
}
