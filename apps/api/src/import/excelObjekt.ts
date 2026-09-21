/**
 * Liest die Monatsblätter einer OBJEKTDATEI (z.B. 10002_2026.xlsm).
 *
 * Die Objektdateien sind genau andersherum aufgebaut als die
 * Verwaltungsdatei: dort steht eine Person mit ihren Objekten darunter,
 * hier steht ein Objekt mit seinen Personen darunter.
 *
 *   Zeile 2:  A = Jahr, B = erster Tag des Monats, G = Objektnummer
 *   Zeile 3:  ab Spalte D die Wochentage
 *   Zeile 4:  A=PersNr. B=Name C=KA
 *             ab Spalte D die 31 Tagesspalten
 *             AI=Arbeit AJ=Ferien AK=Krank AL=Unfall AM=Sonst
 *             AN=Saldo AO=Bemerkungen
 *   Zeile 5+: je eine Person, bis die Zeile "Monatstotal" kommt
 *
 * Das 31-Spalten-Raster ist dasselbe: im Februar gehören die letzten drei
 * Spalten schon zum März. Auch hier werden die Tage aus dem Monat
 * gerechnet statt aus den Spaltenköpfen gelesen.
 *
 * ACHTUNG BEI MEHREREN DATEIEN: Eine Person, die auf fünf Objekten
 * arbeitet, hat ihre Ferien in fünf Objektdateien stehen. Entdoppelt wird
 * deshalb nicht hier, sondern beim Zusammenführen aller Dateien. Siehe
 * `zusammenfuehren` weiter unten.
 */
import XLSX from "xlsx";
import {
  CODES_OBJEKT,
  CODES_PERSON,
  MONATSNAMEN,
  alsText,
  alsZahl,
  datumText,
  tageImMonat,
  zelle,
  type Eintragsart,
  type ExcelEintrag,
  type ExcelSummen,
  type MonatsErgebnis,
} from "./excel.js";

const ERSTE_TAGESSPALTE = 4; // Spalte D
const SUMMENSPALTEN = { arbeit: 35, ferien: 36, krank: 37, unfall: 38, sonst: 39 }; // AI..AM

/** Liest die Objektnummer aus dem Kopf des Blatts (Zelle G2). */
export function objektnummerAusBlatt(mappe: XLSX.WorkBook, blattname: string): string {
  const blatt = mappe.Sheets[blattname];
  if (!blatt) return "";
  return alsText(zelle(blatt, 2, 7));
}

export function leseObjektblatt(
  mappe: XLSX.WorkBook,
  blattname: string,
  jahr: number,
  objektNrVorgabe?: string,
): MonatsErgebnis {
  const blatt = mappe.Sheets[blattname];
  if (!blatt) {
    return {
      blatt: blattname,
      monat: "",
      eintraege: [],
      summenLautExcel: [],
      warnungen: [`Blatt "${blattname}" gibt es in dieser Datei nicht.`],
    };
  }

  const monatIndex = MONATSNAMEN.indexOf(blattname as (typeof MONATSNAMEN)[number]);
  if (monatIndex < 0) {
    return {
      blatt: blattname,
      monat: "",
      eintraege: [],
      summenLautExcel: [],
      warnungen: [`"${blattname}" ist kein Monatsname.`],
    };
  }

  const monat = monatIndex + 1;
  const anzahlTage = tageImMonat(jahr, monat);
  const warnungen: string[] = [];
  const eintraege: ExcelEintrag[] = [];
  const summen: ExcelSummen[] = [];

  const objektNr = objektNrVorgabe ?? alsText(zelle(blatt, 2, 7));
  if (objektNr === "" || objektNr === "0") {
    warnungen.push(`${blattname}: keine Objektnummer im Kopf (Zelle G2).`);
  }

  const bereich = XLSX.utils.decode_range(blatt["!ref"] ?? "A1:A1");
  const letzteZeile = bereich.e.r + 1;

  for (let zeile = 5; zeile <= letzteZeile; zeile++) {
    const erste = alsText(zelle(blatt, zeile, 1));

    // Die Summenzeile am Ende beendet den Personenbereich.
    if (erste.toLowerCase().startsWith("monatstotal")) break;

    const personalnummer = erste;
    if (personalnummer === "" || personalnummer === "0") continue;

    const name = alsText(zelle(blatt, zeile, 2));

    summen.push({
      personalnummer,
      monat: `${jahr}-${String(monat).padStart(2, "0")}`,
      name,
      arbeit: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.arbeit)) ?? 0,
      ferien: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.ferien)) ?? 0,
      krank: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.krank)) ?? 0,
      unfall: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.unfall)) ?? 0,
      sonst: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.sonst)) ?? 0,
    });

    for (let tag = 1; tag <= anzahlTage; tag++) {
      const roh = zelle(blatt, zeile, ERSTE_TAGESSPALTE + tag - 1);
      if (roh === null || roh === undefined || roh === "") continue;

      const datum = datumText(jahr, monat, tag);
      const zahl = alsZahl(roh);

      if (zahl !== null) {
        if (zahl === 0) continue;
        eintraege.push({
          personalnummer,
          objektNr,
          datum,
          art: "arbeit",
          wert: zahl.toFixed(2),
        });
        continue;
      }

      const roher = alsText(roh);
      if (roher === "") continue;
      const normiert = roher.toUpperCase();

      const objektArt: Eintragsart | undefined = CODES_OBJEKT[normiert];
      if (objektArt) {
        eintraege.push({ personalnummer, objektNr, datum, art: objektArt, wert: "1.00" });
        continue;
      }

      const art = CODES_PERSON[normiert];
      if (!art) {
        warnungen.push(`${blattname}, Zeile ${zeile}, ${datum}: unbekanntes Kuerzel "${roher}".`);
        continue;
      }

      // objektNr bleibt null: die Abwesenheit gehoert zur Person, nicht zum
      // Objekt. Entdoppelt wird beim Zusammenfuehren der Dateien.
      eintraege.push({ personalnummer, objektNr: null, datum, art, wert: "1.00" });
    }

    for (let spalte = ERSTE_TAGESSPALTE + anzahlTage; spalte < ERSTE_TAGESSPALTE + 31; spalte++) {
      const roh = zelle(blatt, zeile, spalte);
      const zahl = alsZahl(roh);
      if ((zahl !== null && zahl !== 0) || (typeof roh === "string" && roh.trim() !== "")) {
        warnungen.push(
          `${blattname}, Zeile ${zeile}: Wert in einer Spalte hinter dem Monatsende, wird uebergangen.`,
        );
        break;
      }
    }
  }

  return {
    blatt: blattname,
    monat: datumText(jahr, monat, 1),
    eintraege,
    summenLautExcel: summen,
    warnungen,
  };
}

/**
 * Führt die Einträge aus mehreren Dateien zusammen.
 *
 * Der wichtige Teil: eine Person, die auf fünf Objekten arbeitet, hat ihre
 * Ferien in fünf Objektdateien stehen. Ohne Entdopplung würden daraus fünf
 * Ferientage. Gearbeitete Stunden dagegen bleiben alle erhalten, die
 * gehören ja zu verschiedenen Objekten.
 */
export function zusammenfuehren(teile: ExcelEintrag[][]): {
  eintraege: ExcelEintrag[];
  warnungen: string[];
} {
  const eintraege: ExcelEintrag[] = [];
  const warnungen: string[] = [];
  const abwesenheiten = new Map<string, Eintragsart>();

  for (const teil of teile) {
    for (const eintrag of teil) {
      // Alles mit Objektbezug (Arbeit, Frei) gehoert zum Objekt und bleibt.
      if (eintrag.objektNr !== null) {
        eintraege.push(eintrag);
        continue;
      }

      const schluessel = `${eintrag.personalnummer}|${eintrag.datum}`;
      const schon = abwesenheiten.get(schluessel);

      if (schon === undefined) {
        abwesenheiten.set(schluessel, eintrag.art);
        eintraege.push(eintrag);
        continue;
      }

      if (schon !== eintrag.art) {
        warnungen.push(
          `${eintrag.datum}, PerNr ${eintrag.personalnummer}: in verschiedenen Dateien verschiedene Kuerzel (${schon} und ${eintrag.art}). Es gilt ${schon}.`,
        );
      }
    }
  }

  return { eintraege, warnungen };
}
