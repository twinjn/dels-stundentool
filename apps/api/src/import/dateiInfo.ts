/**
 * Erkennt, was fuer eine Datei vorliegt.
 *
 * Wir verlassen uns bewusst NICHT auf den Dateinamen. Dateien werden
 * umbenannt, kopiert, mit "(2)" versehen oder in einen Jahresordner
 * geschoben. Der Inhalt luegt nicht.
 */
import XLSX from "xlsx";
import { alsText, alsZahl, zelle } from "./excel.js";

export type Dateityp = "verwaltung" | "objekt" | "unbekannt";

export type DateiInfo = {
  typ: Dateityp;
  jahr: number | null;
  objektNr: string | null;
  titel: string;
  grund?: string;
};

/**
 * Sucht im Blatt "Daten" nach einer Beschriftung und liefert den Wert
 * aus der Nachbarspalte. Dort stehen Jahr, Objektnummer und Titel.
 */
function ausDatenblatt(mappe: XLSX.WorkBook, beschriftung: string): string {
  const blatt = mappe.Sheets["Daten"];
  if (!blatt) return "";

  const bereich = XLSX.utils.decode_range(blatt["!ref"] ?? "A1:A1");
  for (let zeile = 1; zeile <= Math.min(bereich.e.r + 1, 60); zeile++) {
    if (alsText(zelle(blatt, zeile, 1)).toLowerCase() === beschriftung.toLowerCase()) {
      return alsText(zelle(blatt, zeile, 2));
    }
  }
  return "";
}

export function erkenneDatei(mappe: XLSX.WorkBook, dateiname = ""): DateiInfo {
  const januar = mappe.Sheets["Januar"];

  if (!januar) {
    return {
      typ: "unbekannt",
      jahr: null,
      objektNr: null,
      titel: "",
      grund: "Kein Blatt namens Januar. Das ist keine Stundenkontrolle.",
    };
  }

  // Die Verwaltungsdatei hat ihre Spaltenueberschriften in Zeile 5 und
  // beginnt mit "ZCode". Die Objektdatei hat sie in Zeile 4 mit "PersNr.".
  const verwaltung = alsText(zelle(januar, 5, 1)).toUpperCase() === "ZCODE";
  const objekt = alsText(zelle(januar, 4, 1))
    .toUpperCase()
    .startsWith("PERSNR");

  const typ: Dateityp = verwaltung ? "verwaltung" : objekt ? "objekt" : "unbekannt";

  // Jahr: erst aus dem Blatt "Daten", dann aus dem Blattkopf, zuletzt aus
  // dem Dateinamen.
  let jahr = Number(ausDatenblatt(mappe, "Aktuelles Jahr")) || null;
  if (!jahr) jahr = alsZahl(zelle(januar, verwaltung ? 3 : 2, verwaltung ? 3 : 1));
  if (!jahr) {
    const treffer = /(20\d{2})/.exec(dateiname);
    jahr = treffer ? Number(treffer[1]) : null;
  }
  if (jahr !== null && (jahr < 2000 || jahr > 2100)) jahr = null;

  const objektNr = objekt
    ? ausDatenblatt(mappe, "Objekt Nr.") || alsText(zelle(januar, 2, 7)) || null
    : null;

  return {
    typ,
    jahr,
    objektNr,
    titel: ausDatenblatt(mappe, "Dokument Titel"),
    ...(typ === "unbekannt"
      ? { grund: "Weder ZCode (Verwaltung) noch PersNr. (Objekt) im Kopf gefunden." }
      : {}),
  };
}
