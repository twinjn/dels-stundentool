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
  ansaetze: Ansaetze & { notiz: string | null };
  objektMonat: ObjektZeile[];
  personMonat: PersonZeile[];
  adminkosten: Adminzeile[];
  eintraege: Eintrag[];
  mitarbeiter: MitarbeiterSatz[];
};

export type MonatEintrag = { monat: string; notiz: string | null };
