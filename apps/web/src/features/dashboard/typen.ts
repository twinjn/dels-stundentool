export type Person = { id: string; name: string };

export type FerienUeberzug = {
  id: string;
  name: string;
  anspruch: number;
  bezogen: number;
};

export type TopObjekt = {
  id: string;
  objektNr: string | null;
  name: string;
  stunden: number;
};

export type Lagebild = {
  monat: string;
  heute: string;
  laufend: boolean;
  bis: string;
  stunden: { zeitraum: number; vormonat: number };
  absenzen: Record<string, number>;
  mitarbeiter: { gesamt: number; mitErfassung: number };
  objekte: { gesamt: number; bebucht: number };
  topObjekte: TopObjekt[];
  offen: {
    ohneErfassung: Person[];
    ohneErfassungAnzahl: number;
    ueberFerienanspruch: FerienUeberzug[];
    /** null heisst: diese Rolle darf die Liste nicht sehen. */
    ohneStundenlohn: Person[] | null;
  };
};
