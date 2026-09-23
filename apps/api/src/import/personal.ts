/**
 * Liest das Blatt "Personal" aus einer Objektdatei.
 *
 * Es ist die eigentliche Personalverwaltung der bestehenden Lösung und
 * deutlich vollständiger als alles, was sonst vorliegt.
 *
 *   Zeile 2:  Spaltenüberschriften
 *   Zeile 3+: je eine Person
 *
 *   A=PersNr.  B=Gruppe  C=Status  D=Anrede  E=Name  F=Vorname
 *   G=Funktion H=Einsatzort I=Bemerkungen J=Datum (Austritt)
 *   K=Ferien (Anspruch)  L=F-Saldo
 *   M=PLZ  N=Ort  O=Strasse  P=Nr  Q=Mail  R=Mail2  S=Tf  T=Mobil
 *   U=Geburtstag  V=Nation  W=Jahrestag
 *
 * Der Name steht auf zwei Spalten verteilt. Zusammengesetzt wird
 * "Nachname Vorname", so wie es auch in den Monatsblättern steht, damit
 * dieselbe Person nicht zweimal unter verschiedener Schreibweise landet.
 */
import XLSX from "xlsx";
import { alsText, alsZahl, zelle } from "./excel.js";

export type PersonalZeile = {
  personalnummer: string;
  name: string;
  aktiv: boolean;
  gruppe: string | null;
  anrede: string | null;
  funktion: string | null;
  einsatzort: string | null;
  notizen: string | null;
  austrittsdatum: string | null;
  ferienanspruch: string | null;
  ferienSaldo: string | null;
  plz: string | null;
  ort: string | null;
  strasse: string | null;
  email: string | null;
  telefon: string | null;
  mobil: string | null;
  geburtsdatum: string | null;
  nationalitaet: string | null;
};

export type PersonalErgebnis = {
  zeilen: PersonalZeile[];
  warnungen: string[];
};

const SPALTEN = {
  personalnummer: 1,
  gruppe: 2,
  status: 3,
  anrede: 4,
  nachname: 5,
  vorname: 6,
  funktion: 7,
  einsatzort: 8,
  bemerkungen: 9,
  austritt: 10,
  ferien: 11,
  saldo: 12,
  plz: 13,
  ort: 14,
  strasse: 15,
  hausnummer: 16,
  mail: 17,
  telefon: 19,
  mobil: 20,
  geburtstag: 21,
  nation: 22,
} as const;

function textOderNull(wert: unknown): string | null {
  const text = alsText(wert);
  return text === "" || text === "0" ? null : text;
}

/**
 * Excel speichert Datumswerte als Zahl (Tage seit dem 30.12.1899).
 * Wir rechnen sie selbst um, statt sie als Date einzulesen: ein Date hat
 * immer eine Zeitzone, und genau daran verschieben sich Geburtstage um
 * einen Tag.
 */
export function excelDatum(wert: unknown): string | null {
  if (wert instanceof Date) {
    return `${wert.getUTCFullYear()}-${String(wert.getUTCMonth() + 1).padStart(2, "0")}-${String(wert.getUTCDate()).padStart(2, "0")}`;
  }

  const zahl = alsZahl(wert);
  if (zahl === null || zahl <= 0) {
    const text = alsText(wert);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  // Excel zählt ab dem 30.12.1899 und hat den Schaltjahrfehler von 1900
  // mit eingebaut, den dieser Nullpunkt ausgleicht.
  const millisekunden = Math.round(zahl) * 86_400_000;
  const datum = new Date(Date.UTC(1899, 11, 30) + millisekunden);
  const jahr = datum.getUTCFullYear();
  if (jahr < 1900 || jahr > 2100) return null;

  return `${jahr}-${String(datum.getUTCMonth() + 1).padStart(2, "0")}-${String(datum.getUTCDate()).padStart(2, "0")}`;
}

export function lesePersonalblatt(mappe: XLSX.WorkBook): PersonalErgebnis {
  const blatt = mappe.Sheets["Personal"];
  if (!blatt) return { zeilen: [], warnungen: ['Kein Blatt "Personal" in dieser Datei.'] };

  const warnungen: string[] = [];
  const zeilen: PersonalZeile[] = [];
  const gesehen = new Set<string>();

  const bereich = XLSX.utils.decode_range(blatt["!ref"] ?? "A1:A1");

  for (let zeile = 3; zeile <= bereich.e.r + 1; zeile++) {
    const personalnummer = alsText(zelle(blatt, zeile, SPALTEN.personalnummer));
    if (personalnummer === "" || personalnummer === "0") continue;

    if (gesehen.has(personalnummer)) {
      warnungen.push(`Zeile ${zeile}: Personalnummer ${personalnummer} kommt mehrfach vor.`);
      continue;
    }
    gesehen.add(personalnummer);

    const nachname = alsText(zelle(blatt, zeile, SPALTEN.nachname));
    const vorname = alsText(zelle(blatt, zeile, SPALTEN.vorname));
    const name = [nachname, vorname]
      .filter((t) => t !== "" && t !== "0")
      .join(" ")
      .trim();

    if (name === "") {
      warnungen.push(`Zeile ${zeile}: PerNr ${personalnummer} hat keinen Namen, uebersprungen.`);
      continue;
    }

    const status = alsText(zelle(blatt, zeile, SPALTEN.status)).toLowerCase();
    if (status !== "" && status !== "aktiv" && status !== "inaktiv") {
      warnungen.push(`Zeile ${zeile}: unbekannter Status "${status}", gilt als inaktiv.`);
    }

    const strasse = alsText(zelle(blatt, zeile, SPALTEN.strasse));
    const hausnummer = alsText(zelle(blatt, zeile, SPALTEN.hausnummer));
    const ferien = alsZahl(zelle(blatt, zeile, SPALTEN.ferien));
    const saldo = alsZahl(zelle(blatt, zeile, SPALTEN.saldo));

    zeilen.push({
      personalnummer,
      name,
      aktiv: status === "aktiv",
      gruppe: textOderNull(zelle(blatt, zeile, SPALTEN.gruppe)),
      anrede: textOderNull(zelle(blatt, zeile, SPALTEN.anrede)),
      funktion: textOderNull(zelle(blatt, zeile, SPALTEN.funktion)),
      einsatzort: textOderNull(zelle(blatt, zeile, SPALTEN.einsatzort)),
      notizen: textOderNull(zelle(blatt, zeile, SPALTEN.bemerkungen)),
      austrittsdatum: excelDatum(zelle(blatt, zeile, SPALTEN.austritt)),
      ferienanspruch: ferien !== null && ferien > 0 ? ferien.toFixed(2) : null,
      ferienSaldo: saldo !== null ? saldo.toFixed(2) : null,
      plz: textOderNull(zelle(blatt, zeile, SPALTEN.plz)),
      ort: textOderNull(zelle(blatt, zeile, SPALTEN.ort)),
      strasse:
        [strasse, hausnummer]
          .filter((t) => t !== "" && t !== "0")
          .join(" ")
          .trim() || null,
      email: textOderNull(zelle(blatt, zeile, SPALTEN.mail)),
      telefon: textOderNull(zelle(blatt, zeile, SPALTEN.telefon)),
      mobil: textOderNull(zelle(blatt, zeile, SPALTEN.mobil)),
      geburtsdatum: excelDatum(zelle(blatt, zeile, SPALTEN.geburtstag)),
      nationalitaet: textOderNull(zelle(blatt, zeile, SPALTEN.nation)),
    });
  }

  if (zeilen.length === 0) warnungen.push("Das Blatt Personal enthält keine Zeilen.");

  return { zeilen, warnungen };
}
