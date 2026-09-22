export type Art = "arbeit" | "ferien" | "krankheit" | "unfall" | "feiertag" | "sonstiges";

export type Summen = Record<Art, number>;

export type Jahreszeile = {
  id: string;
  name: string;
  personalnummer: string | null;
  aktiv: boolean;
  ferienanspruch: number;
  ferienSaldo: number | null;
  ferienSaldoStand: string | null;
  /** Zwoelf Eintraege, Index 0 ist Januar. */
  monate: Summen[];
  jahr: Summen;
};

export type Jahresuebersicht = {
  jahr: number;
  mitarbeiter: Jahreszeile[];
};
