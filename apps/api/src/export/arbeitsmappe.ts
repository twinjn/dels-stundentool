/**
 * Eine duenne Schicht ueber SheetJS, damit die Export-Module sich um
 * Inhalte kuemmern und nicht um Zellkoordinaten.
 *
 * Zwei Dinge, die hier bewusst so sind:
 *
 * 1. Datumswerte werden als Excel-Seriennummer geschrieben, selbst
 *    gerechnet. Gibt man SheetJS ein Date-Objekt, rechnet es in ORTSZEIT
 *    um. Auf einem Server in einer Zeitzone westlich von UTC wird aus
 *    dem 1. Februar dann der 31. Januar. Genau diese Klasse von Fehler
 *    hat uns beim Import schon beschaeftigt.
 *
 * 2. Es wird .xlsx geschrieben, nicht .csv. Ein Name wie "=cmd|..."
 *    landet in einer xlsx-Datei als Text (Typ "s"), in einer CSV-Datei
 *    dagegen als Formel. Das ist nicht nur Kosmetik, das ist der
 *    Unterschied zwischen einer Tabelle und einer Sicherheitsluecke.
 *
 * Was SheetJS in der freien Fassung NICHT kann und wir deshalb auch
 * nicht anbieten: eingefrorene Kopfzeilen, Rahmen, Farben, Fettdruck.
 * Geprueft, nicht vermutet: ein gesetztes ws["!freeze"] taucht in der
 * erzeugten Datei nicht auf.
 */
import * as XLSX from "xlsx";

export type Zellwert = string | number | null;

/** In Excel eingebaute Formate. Brauchen keine eigene Definition. */
export const F_ZAHL = "#,##0.00";
export const F_STUNDEN = "0.00";
export const F_GANZ = "#,##0";
export const F_DATUM = "DD.MM.YYYY";
export const F_PROZENT = "0.00%";

const EXCEL_EPOCHE = Date.UTC(1899, 11, 30);
const MS_PRO_TAG = 86_400_000;

/** "JJJJ-MM-TT" in eine Excel-Seriennummer. Gegenstueck zu excelDatum(). */
export function alsExcelDatum(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!treffer) return null;
  const [, jahr, monat, tag] = treffer as unknown as [string, string, string, string];
  const ms = Date.UTC(Number(jahr), Number(monat) - 1, Number(tag));
  return Math.round((ms - EXCEL_EPOCHE) / MS_PRO_TAG);
}

/** numeric-Spalten kommen aus Postgres als Text. Leer bleibt leer. */
export function alsZahl(wert: string | number | null | undefined): number | null {
  if (wert === null || wert === undefined || wert === "") return null;
  const zahl = Number(wert);
  return Number.isFinite(zahl) ? zahl : null;
}

export type Blattbau = {
  zeilen: Zellwert[][];
  /** Spaltenbreiten in Zeichen. */
  breiten?: number[];
  /** Spaltenindex -> Zahlenformat. Gilt nur fuer Zellen, die Zahlen sind. */
  formate?: Record<number, string>;
  /** Ab welcher Zeile (0-basiert) die Formate gelten. Darueber stehen Titel. */
  datenAb?: number;
};

export function blatt(bau: Blattbau): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(bau.zeilen);

  if (bau.breiten) ws["!cols"] = bau.breiten.map((wch) => ({ wch }));

  if (bau.formate) {
    const ab = bau.datenAb ?? 0;
    const eintraege = Object.entries(bau.formate);
    for (let r = ab; r < bau.zeilen.length; r++) {
      for (const [spalte, format] of eintraege) {
        const adresse = XLSX.utils.encode_cell({ r, c: Number(spalte) });
        const zelle = ws[adresse] as XLSX.CellObject | undefined;
        // Nur Zahlen formatieren. Ein Format auf einer Textzelle ist
        // wirkungslos und verwirrt beim Nachschauen nur.
        if (zelle?.t === "n") zelle.z = format;
      }
    }
  }

  return ws;
}

/** Excel erlaubt 31 Zeichen und einige Zeichen gar nicht. */
export function blattname(roh: string): string {
  const sauber = roh
    .replace(/[[\]:*?/\\]/g, " ")
    .trim()
    .slice(0, 31);
  return sauber === "" ? "Blatt" : sauber;
}

export function mappe(blaetter: { name: string; blatt: XLSX.WorkSheet }[]): Buffer {
  const wb = XLSX.utils.book_new();
  const vergeben = new Set<string>();

  for (const b of blaetter) {
    let name = blattname(b.name);
    // Zwei Blaetter mit demselben Namen lehnt Excel ab.
    let zaehler = 2;
    while (vergeben.has(name)) name = blattname(`${b.name} ${zaehler++}`);
    vergeben.add(name);
    XLSX.utils.book_append_sheet(wb, b.blatt, name);
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
