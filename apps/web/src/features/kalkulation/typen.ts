import type {
  Adminposten,
  Ansaetze,
  Eintrag,
  MitarbeiterSatz,
  ObjektMonat,
  PersonMonat,
} from "@dels/shared";

export type ObjektZeile = ObjektMonat & {
  objektNr: string | null;
  objektName: string;
};

export type PersonZeile = PersonMonat & {
  name: string;
  personalnummer: string | null;
};

export type Adminzeile = Adminposten & { id: string; sortierung: number };

export type Monatsdaten = {
  monat: string;
  ansaetze: Ansaetze & {
    notiz: string | null;
    /** Gesetzt, wenn der Monat abgeschlossen ist. Dann nimmt er nichts mehr an. */
    abgeschlossenAm: string | null;
    abgeschlossenVon: string | null;
  };
  objektMonat: ObjektZeile[];
  personMonat: PersonZeile[];
  adminkosten: Adminzeile[];
  eintraege: Eintrag[];
  mitarbeiter: MitarbeiterSatz[];
};

export type MonatEintrag = { monat: string; notiz: string | null };

/**
 * Ein Punkt, an dem Stammdaten und Monat auseinanderlaufen.
 *
 * Gleiche Form wie auf dem Server (kalkulation/abgleich.ts). Zwei
 * getrennte Fassungen wären hier besonders unangenehm, weil der
 * Browser die Schlüssel zurückschickt und der Server sie wiederfinden
 * muss.
 */
export type Unterschied =
  | {
      art: "objekt_fehlt";
      objektId: string;
      objektNr: string | null;
      name: string;
      abo: string | null;
      stunden: number;
    }
  | {
      art: "abo_weicht_ab";
      objektId: string;
      objektNr: string | null;
      name: string;
      imMonat: string | null;
      lautStammdaten: string | null;
    }
  | { art: "objekt_stillgelegt"; objektId: string; objektNr: string | null; name: string }
  | {
      art: "person_fehlt";
      mitarbeiterId: string;
      personalnummer: string | null;
      name: string;
      stunden: number;
    };

export type Abgleichsbericht = {
  monat: string;
  abgeschlossen: boolean;
  unterschiede: Unterschied[];
};

/** Ein Preis, der ab einem Stichtag gilt. */
export type Preiseintrag = {
  id: string;
  objektId: string;
  gueltigAb: string;
  betrag: string;
  bemerkung: string | null;
  erfasstVon: string | null;
  erstelltAm: string;
};
