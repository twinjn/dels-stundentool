import type { Eintragsart } from "@dels/shared";

export type Tag = {
  datum: string;
  tag: number;
  wochentag: string;
  wochenende: boolean;
};

export type Zelle = { art: Eintragsart; wert: string };

export type Objektzeile = {
  objektId: string;
  objektNr: string | null;
  name: string;
  tage: Record<string, Zelle>;
};

export type Personenzeile = {
  id: string;
  name: string;
  personalnummer: string | null;
  sollProTag: string;
  aktiv: boolean;
  abwesenheiten: Record<string, Eintragsart>;
  objekte: Objektzeile[];
  summen: {
    arbeit: number;
    ferien: number;
    krankheit: number;
    unfall: number;
    feiertag: number;
    sonstiges: number;
  };
};

export type Monatsraster = {
  monat: string;
  tage: Tag[];
  mitarbeiter: Personenzeile[];
};

export type ObjektAuswahl = { id: string; objektNr: string | null; name: string };

/**
 * Eine Zeile im Raster, flach durchnummeriert.
 * Gebraucht für die Tastaturnavigation: Enter springt zur nächsten
 * Zeile, und dafür muss klar sein, welche das ist.
 */
export type Rasterzeile =
  | { art: "person"; personId: string; nummer: number }
  | { art: "objekt"; personId: string; objektId: string; nummer: number };

export function zeilenFlachLegen(
  personen: Personenzeile[],
  zusatzzeilen: Record<string, string[]>,
): Rasterzeile[] {
  const flach: Rasterzeile[] = [];
  let nummer = 0;

  for (const person of personen) {
    flach.push({ art: "person", personId: person.id, nummer: nummer++ });

    const gezeigt = new Set(person.objekte.map((o) => o.objektId));
    for (const objekt of person.objekte) {
      flach.push({
        art: "objekt",
        personId: person.id,
        objektId: objekt.objektId,
        nummer: nummer++,
      });
    }
    for (const zusatz of zusatzzeilen[person.id] ?? []) {
      if (gezeigt.has(zusatz)) continue;
      flach.push({ art: "objekt", personId: person.id, objektId: zusatz, nummer: nummer++ });
    }
  }

  return flach;
}
