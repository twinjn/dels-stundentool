/**
 * Was passiert, wenn jemand in eine Tageszelle tippt.
 *
 * Die Regeln sind dieselben wie im bestehenden Excel, damit niemand
 * umlernen muss: eine Zahl sind Stunden, ein Buchstabe ist eine
 * Abwesenheit.
 *
 *   8.4   8,4   8:24       ->  8.40 Stunden
 *   F  f              ->  Ferien
 *   K                 ->  Krank
 *   U                 ->  Unfall
 *   S                 ->  Sonstiges
 *   FT                ->  Feiertag
 *   Fr  FF            ->  Frei (gehört zum Objekt, nicht zur Person)
 *   leer              ->  Eintrag löschen
 */

export const EINTRAGSARTEN = [
  "arbeit",
  "ferien",
  "krankheit",
  "unfall",
  "feiertag",
  "frei",
  "sonstiges",
  "spesen",
] as const;
export type Eintragsart = (typeof EINTRAGSARTEN)[number];

/** Abwesenheiten der Person: gelten den ganzen Tag, ohne Objektbezug. */
export const PERSONEN_CODES: Record<string, Eintragsart> = {
  F: "ferien",
  K: "krankheit",
  U: "unfall",
  S: "sonstiges",
  FT: "feiertag",
};

/** Codes, die zum Objekt gehoeren. */
export const OBJEKT_CODES: Record<string, Eintragsart> = {
  FR: "frei",
  FF: "frei",
};

/** Was in der Zelle angezeigt wird. Kurz, damit 31 Spalten nebeneinander passen. */
export const KUERZEL: Record<Eintragsart, string> = {
  arbeit: "",
  ferien: "F",
  krankheit: "K",
  unfall: "U",
  feiertag: "FT",
  frei: "Fr",
  sonstiges: "S",
  spesen: "Sp",
};

export type Zelleninhalt =
  { leeren: true } | { leeren: false; art: Eintragsart; wert: string } | { fehler: string };

export function istFehler(inhalt: Zelleninhalt): inhalt is { fehler: string } {
  return "fehler" in inhalt;
}

/**
 * Deutet, was jemand in eine Zelle getippt hat.
 *
 * `fuerObjekt` sagt, ob die Zelle zu einer Objektzeile gehoert. Danach
 * richtet sich, welche Kürzel erlaubt sind: Ferien gehören zur Person,
 * "Frei" zum Objekt. Wer sie verwechselt, verfälscht den
 * Ferienanspruch, deshalb wird es hier abgelehnt statt stillschweigend
 * umgedeutet.
 */
export function deuteZelleneingabe(eingabe: string, fuerObjekt: boolean): Zelleninhalt {
  const roh = eingabe.trim();
  if (roh === "") return { leeren: true };

  const normiert = roh.toUpperCase();

  const personenArt = PERSONEN_CODES[normiert];
  if (personenArt) {
    if (fuerObjekt) {
      return {
        fehler: `"${roh}" gehoert zur Person, nicht zum Objekt. Bitte in die Zeile mit dem Namen eintragen.`,
      };
    }
    return { leeren: false, art: personenArt, wert: "1.00" };
  }

  const objektArt = OBJEKT_CODES[normiert];
  if (objektArt) {
    if (!fuerObjekt) {
      return { fehler: `"${roh}" gehoert zu einem Objekt. Bitte in eine Objektzeile eintragen.` };
    }
    return { leeren: false, art: objektArt, wert: "1.00" };
  }

  // Zahl? Komma und Hochkomma wie in der Schweiz üblich, dazu 8:24 als
  // Schreibweise für 8 Stunden 24 Minuten.
  const zeitTreffer = /^(\d{1,2}):([0-5]\d)$/.exec(roh);
  if (zeitTreffer) {
    const stunden = Number(zeitTreffer[1]) + Number(zeitTreffer[2]) / 60;
    if (!fuerObjekt) {
      return { fehler: "Stunden gehören auf eine Objektzeile." };
    }
    return { leeren: false, art: "arbeit", wert: stunden.toFixed(2) };
  }

  const zahlText = roh.replace(/'/g, "").replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(zahlText)) {
    return {
      fehler: `"${roh}" verstehe ich nicht. Erlaubt sind Stunden (8.4) oder ein Kuerzel (F, K, U, S, Fr).`,
    };
  }

  const zahl = Number(zahlText);
  if (zahl === 0) return { leeren: true };
  if (zahl > 24) return { fehler: "Mehr als 24 Stunden an einem Tag?" };
  if (!fuerObjekt) {
    return { fehler: "Stunden gehören auf eine Objektzeile, nicht auf die Personenzeile." };
  }

  return { leeren: false, art: "arbeit", wert: zahl.toFixed(2) };
}

/** Wie ein gespeicherter Wert in der Zelle dargestellt wird. */
export function zeigeZelle(art: Eintragsart, wert: string): string {
  if (art === "arbeit") {
    const zahl = Number(wert);
    // 8.40 sieht in einer engen Spalte schlechter aus als 8.4
    return Number.isFinite(zahl) ? String(zahl) : wert;
  }
  return KUERZEL[art];
}
