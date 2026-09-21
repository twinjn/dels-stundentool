/**
 * Liest die Monatsblätter der bestehenden Excel-Stundenkontrolle.
 *
 * AUFBAU EINES MONATSBLATTS (aus der echten Datei abgeleitet):
 *
 *   Zeile 3:  C = Jahr, D = erster Tag des Monats
 *   Zeile 4:  ab Spalte I die Wochentage
 *   Zeile 5:  A=ZCode B=Z C=PerNr. D=Name/Objekt E=Obj.Nr. F=Pos. G=KA
 *             ab Spalte I die Tagesdaten, dahinter die Summen
 *             AN=Arbeit AO=Ferien AP=Krank AQ=Unfall AR=Sonst AS=Spesen
 *   Zeile 6+: Bloecke je Person
 *             ZCode 1 = Summenzeile der Person (Name in D)
 *             ZCode 2 = je eine Zeile pro Objekt (Obj.Nr. in E)
 *
 * ZWEI FALLEN, die ein naiver Import uebersieht:
 *
 * 1. Abwesenheiten stehen auf JEDER Objektzeile einer Person, an denselben
 *    Tagen. Wer zwei Objekte hat, hat das "F" zweimal dastehen. Excel zaehlt
 *    es trotzdem einmal. Wer das nicht entdoppelt, verdoppelt die Ferientage.
 *
 * 2. Das Raster ist immer 31 Spalten breit, auch im Februar. Die ueberzaehligen
 *    Spalten gehoeren zum Folgemonat. Wir rechnen die Tage deshalb selbst aus
 *    dem Monat aus, statt den Spaltenkoepfen zu glauben. Das umgeht auch alle
 *    Zeitzonenprobleme beim Lesen von Excel-Datumswerten.
 */
import XLSX from "xlsx";

export const MONATSNAMEN = [
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
] as const;

export type Eintragsart =
  "arbeit" | "ferien" | "krankheit" | "unfall" | "feiertag" | "frei" | "sonstiges" | "spesen";

/**
 * Die Buchstaben aus den Tageszellen. Kleinschreibung und Leerzeichen
 * kommen in den echten Daten vor, deshalb wird vorher normiert.
 *
 * Wichtig ist die Unterscheidung, und sie stammt aus den Daten selbst,
 * nicht aus einer Vermutung:
 *
 * ABWESENHEITEN DER PERSON (F, K, U, S, FT) gelten fuer den ganzen Tag.
 * Sie stehen auf jeder Objektzeile der Person und werden einmal gezaehlt.
 * Excel summiert sie rechts in den Spalten Ferien, Krank, Unfall, Sonst.
 *
 * FREI (Fr, FF) ist etwas anderes. In den echten Daten steht es an
 * verschiedenen Tagen auf verschiedenen Objektzeilen derselben Person, und
 * Excel zaehlt es in KEINE der Summenspalten. Es gehoert also zum Objekt
 * ("hier ist heute nichts zu tun"), nicht zur Person. Wer es mit Ferien in
 * einen Topf wirft, verfaelscht den Ferienanspruch.
 */
export const CODES_PERSON: Record<string, Eintragsart> = {
  F: "ferien",
  K: "krankheit",
  U: "unfall",
  S: "sonstiges",
  FT: "feiertag",
};

export const CODES_OBJEKT: Record<string, Eintragsart> = {
  FR: "frei",
  FF: "frei",
};

const ERSTE_TAGESSPALTE = 9; // Spalte I
const SUMMENSPALTEN = { arbeit: 40, ferien: 41, krank: 42, unfall: 43, sonst: 44 }; // AN..AR

export type ExcelEintrag = {
  personalnummer: string;
  objektNr: string | null;
  datum: string;
  art: Eintragsart;
  wert: string;
};

export type ExcelSummen = {
  personalnummer: string;
  name: string;
  arbeit: number;
  ferien: number;
  krank: number;
  unfall: number;
  sonst: number;
};

export type MonatsErgebnis = {
  blatt: string;
  monat: string;
  eintraege: ExcelEintrag[];
  summenLautExcel: ExcelSummen[];
  warnungen: string[];
};

export function zelle(blatt: XLSX.WorkSheet, zeile: number, spalte: number): unknown {
  const adresse = XLSX.utils.encode_cell({ r: zeile - 1, c: spalte - 1 });
  return (blatt[adresse] as { v?: unknown } | undefined)?.v;
}

export function alsZahl(wert: unknown): number | null {
  if (typeof wert === "number" && Number.isFinite(wert)) return wert;
  return null;
}

export function alsText(wert: unknown): string {
  return wert === null || wert === undefined ? "" : String(wert).trim();
}

/** Tage eines Monats, ohne Zeitzonenfallen: nur Jahr und Monat zaehlen. */
export function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

export function datumText(jahr: number, monat: number, tag: number): string {
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

/**
 * Liest ein Monatsblatt der VERWALTUNGSDATEI
 * (Stundenkontrolle_Verwaltung_JAHR_Mitarbeiter.xlsm).
 * Wirft nicht bei unsauberen Daten, sondern sammelt Warnungen: ein Import,
 * der beim ersten Tippfehler abbricht, hilft niemandem.
 */
export function leseVerwaltungsblatt(
  mappe: XLSX.WorkBook,
  blattname: string,
  jahr: number,
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

  const bereich = XLSX.utils.decode_range(blatt["!ref"] ?? "A1:A1");
  const letzteZeile = bereich.e.r + 1;

  type Objektzeile = { zeile: number; objektNr: string; tage: Map<number, unknown> };
  type Block = { personalnummer: string; name: string; zeilen: Objektzeile[] };

  let block: Block | null = null;

  /**
   * Wertet einen fertigen Personenblock aus.
   *
   * Der heikle Teil sind die Abwesenheiten. Sie gehoeren zur Person, stehen
   * aber auf jeder Objektzeile. Excel teilt jede Markierung durch die Anzahl
   * Objektzeilen, um doppeltes Zaehlen zu vermeiden. Nebenwirkung: fehlt die
   * Markierung auf einer Zeile, wird daraus ein halber Tag, und niemand
   * merkt es. Wir nehmen stattdessen den Tag als ganzen und melden die
   * Ungereimtheit.
   */
  function blockAuswerten(b: Block): void {
    // Nur Zeilen zaehlen, die ueberhaupt eine Personen-Abwesenheit tragen.
    // "Frei" darf hier nicht mitzaehlen, sonst meldet die Pruefung unten
    // lauter Faelle, die voellig in Ordnung sind.
    const mitCode = b.zeilen.filter((z) =>
      [...z.tage.values()].some(
        (w) => typeof w === "string" && CODES_PERSON[w.trim().toUpperCase()] !== undefined,
      ),
    );

    const artJeTag = new Map<number, Eintragsart>();
    const zaehlerJeTag = new Map<number, number>();

    for (const zeile of b.zeilen) {
      const hatObjekt = zeile.objektNr !== "" && zeile.objektNr !== "0";

      for (const [tag, roh] of zeile.tage) {
        const zahl = alsZahl(roh);

        if (zahl !== null) {
          if (zahl === 0) continue;
          if (!hatObjekt) {
            warnungen.push(`${blattname}, Zeile ${zeile.zeile}: ${zahl} Std. ohne Objektnummer.`);
            continue;
          }
          eintraege.push({
            personalnummer: b.personalnummer,
            objektNr: zeile.objektNr,
            datum: datumText(jahr, monat, tag),
            art: "arbeit",
            wert: zahl.toFixed(2),
          });
          continue;
        }

        const roher = alsText(roh);
        if (roher === "") continue;
        const normiert = roher.toUpperCase();

        // "Frei" bleibt beim Objekt und wird nicht entdoppelt.
        const objektArt = CODES_OBJEKT[normiert];
        if (objektArt) {
          if (!hatObjekt) continue;
          eintraege.push({
            personalnummer: b.personalnummer,
            objektNr: zeile.objektNr,
            datum: datumText(jahr, monat, tag),
            art: objektArt,
            wert: "1.00",
          });
          continue;
        }

        const art = CODES_PERSON[normiert];
        if (!art) {
          warnungen.push(
            `${blattname}, Zeile ${zeile.zeile}, ${datumText(jahr, monat, tag)}: unbekanntes Kuerzel "${roher}".`,
          );
          continue;
        }

        const bisher = artJeTag.get(tag);
        if (bisher && bisher !== art) {
          warnungen.push(
            `${blattname}, ${datumText(jahr, monat, tag)}, PerNr ${b.personalnummer}: zwei verschiedene Kuerzel am selben Tag (${bisher} und ${art}). Es gilt ${bisher}.`,
          );
          continue;
        }

        artJeTag.set(tag, art);
        zaehlerJeTag.set(tag, (zaehlerJeTag.get(tag) ?? 0) + 1);
      }
    }

    for (const [tag, art] of artJeTag) {
      const gesetzt = zaehlerJeTag.get(tag) ?? 0;

      // Genau hier entstehen in Excel die halben Tage.
      if (mitCode.length > 1 && gesetzt < mitCode.length) {
        warnungen.push(
          `${blattname}, ${datumText(jahr, monat, tag)}, PerNr ${b.personalnummer}: Kuerzel nur auf ${gesetzt} von ${mitCode.length} Objektzeilen. Excel zaehlt das als Bruchteil eines Tages, wir zaehlen den ganzen Tag.`,
        );
      }

      eintraege.push({
        personalnummer: b.personalnummer,
        objektNr: null,
        datum: datumText(jahr, monat, tag),
        art,
        wert: "1.00",
      });
    }
  }

  for (let zeile = 6; zeile <= letzteZeile; zeile++) {
    const zcode = alsZahl(zelle(blatt, zeile, 1));
    if (zcode !== 1 && zcode !== 2) continue;

    const personalnummer = alsText(zelle(blatt, zeile, 3));
    if (personalnummer === "" || personalnummer === "0") continue;

    if (zcode === 1) {
      if (block) blockAuswerten(block);
      block = null;

      const name = alsText(zelle(blatt, zeile, 4));
      // Eine Personenzeile ohne Namen ist ein leerer Platzhalter im Raster.
      if (name === "" || name === "0") continue;

      summen.push({
        personalnummer,
        name,
        arbeit: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.arbeit)) ?? 0,
        ferien: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.ferien)) ?? 0,
        krank: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.krank)) ?? 0,
        unfall: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.unfall)) ?? 0,
        sonst: alsZahl(zelle(blatt, zeile, SUMMENSPALTEN.sonst)) ?? 0,
      });

      block = { personalnummer, name, zeilen: [] };
      continue;
    }

    if (!block) continue;

    const tage = new Map<number, unknown>();
    for (let tag = 1; tag <= anzahlTage; tag++) {
      const roh = zelle(blatt, zeile, ERSTE_TAGESSPALTE + tag - 1);
      if (roh !== null && roh !== undefined && roh !== "") tage.set(tag, roh);
    }

    // Steht in den ueberzaehligen Spalten (Folgemonat) doch etwas?
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

    block.zeilen.push({ zeile, objektNr: alsText(zelle(blatt, zeile, 5)), tage });
  }

  if (block) blockAuswerten(block);

  return {
    blatt: blattname,
    monat: datumText(jahr, monat, 1),
    eintraege,
    summenLautExcel: summen,
    warnungen,
  };
}

/**
 * Rechnet aus den gelesenen Eintraegen dieselben Summen nach, die Excel
 * rechts anzeigt. Weicht etwas ab, haben wir das Blatt falsch verstanden.
 */
export function summenNachrechnen(eintraege: ExcelEintrag[]): Map<string, ExcelSummen> {
  const ergebnis = new Map<string, ExcelSummen>();

  for (const eintrag of eintraege) {
    let zeile = ergebnis.get(eintrag.personalnummer);
    if (!zeile) {
      zeile = {
        personalnummer: eintrag.personalnummer,
        name: "",
        arbeit: 0,
        ferien: 0,
        krank: 0,
        unfall: 0,
        sonst: 0,
      };
      ergebnis.set(eintrag.personalnummer, zeile);
    }

    const wert = Number(eintrag.wert);
    if (eintrag.art === "arbeit") zeile.arbeit += wert;
    else if (eintrag.art === "ferien") zeile.ferien += wert;
    else if (eintrag.art === "krankheit") zeile.krank += wert;
    else if (eintrag.art === "unfall") zeile.unfall += wert;
    // "frei" bleibt bewusst aussen vor: Excel zaehlt es in keine Summe.
    else if (eintrag.art === "sonstiges") zeile.sonst += wert;
  }

  return ergebnis;
}
