export type Person = { id: string; name: string };

/** Eine Zeile aus der Ferienrechnung, so wie das Dashboard sie braucht. */
export type Ferienzeile = {
  id: string;
  name: string;
  /** Rest in Tagen. Negativ heisst: mehr bezogen als zusteht. */
  rest: number;
  /** Kein Stichtag hinterlegt, der Übertrag ist aus der Historie gerechnet. */
  unsicher: boolean;
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
    /** Saldo im Minus: mehr bezogen, als Anspruch plus Übertrag hergeben. */
    ferienMinus: Ferienzeile[];
    /** Ab Oktober: wer hat noch Tage offen. null = noch zu früh im Jahr. */
    ferienOffen: Ferienzeile[] | null;
    /** null heisst: diese Rolle darf die Liste nicht sehen. */
    ohneStundenlohn: Person[] | null;
  };
};
