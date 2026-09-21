/**
 * Die Jahresuebersicht als Excel-Arbeitsmappe.
 *
 * Ein Blatt je Eintragsart plus ein Blatt "Ferien" mit Anspruch,
 * bezogenen Tagen und dem uebernommenen Saldo. Getrennte Blaetter statt
 * eines breiten Blattes mit 72 Spalten: so laesst sich jedes einzeln
 * filtern, sortieren und ausdrucken.
 */
import { jahresuebersicht, ARTEN, type Jahresuebersicht } from "../uebersicht/jahr.js";
import { alsExcelDatum, blatt, mappe, F_DATUM, F_STUNDEN, type Zellwert } from "./arbeitsmappe.js";
import { jetztInZuerich } from "./stunden.js";

const MONATSKUERZEL = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

const ARTNAME: Record<string, string> = {
  arbeit: "Arbeit (Std.)",
  ferien: "Ferien (Tage)",
  krankheit: "Krankheit (Tage)",
  unfall: "Unfall (Tage)",
  feiertag: "Feiertag (Tage)",
  sonstiges: "Sonstiges (Tage)",
};

export function uebersichtsmappe(daten: Jahresuebersicht, erstelltAm = jetztInZuerich()): Buffer {
  const blaetter = ARTEN.map((art) => {
    const zeilen: Zellwert[][] = [];
    zeilen.push([`${ARTNAME[art]} ${daten.jahr}`]);
    zeilen.push([`Erstellt am ${erstelltAm}`]);
    zeilen.push([]);
    zeilen.push(["Pers.Nr", "Name", ...MONATSKUERZEL, "Total"]);

    const datenAb = zeilen.length;

    for (const person of daten.mitarbeiter) {
      // Wer in dieser Art nichts hat, faellt raus. Ein Blatt "Unfall"
      // mit 140 Nullzeilen und zwei echten Werten ist unbrauchbar.
      if (person.jahr[art] === 0) continue;

      zeilen.push([
        person.personalnummer,
        person.aktiv ? person.name : `${person.name} (ausgetreten)`,
        ...person.monate.map((m) => (m[art] === 0 ? null : m[art])),
        person.jahr[art],
      ]);
    }

    if (zeilen.length === datenAb) {
      zeilen.push([null, `Keine Eintraege dieser Art im Jahr ${daten.jahr}.`]);
    }

    const formate: Record<number, string> = {};
    for (let i = 2; i <= 14; i++) formate[i] = F_STUNDEN;

    return {
      name: ARTNAME[art]!.replace(/ \(.*\)$/, ""),
      blatt: blatt({
        zeilen,
        breiten: [10, 26, ...Array<number>(12).fill(8), 10],
        formate,
        datenAb,
      }),
    };
  });

  // --- Ferienblatt -------------------------------------------------------
  const ferien: Zellwert[][] = [];
  ferien.push([`Ferien ${daten.jahr}`]);
  ferien.push([`Erstellt am ${erstelltAm}`]);
  ferien.push([]);
  ferien.push([
    "Pers.Nr",
    "Name",
    "Jahresanspruch",
    `Bezogen ${daten.jahr}`,
    "Anspruch minus bezogen",
    "Übernommener Saldo",
    "Saldo per",
  ]);
  const ferienAb = ferien.length;

  for (const person of daten.mitarbeiter) {
    ferien.push([
      person.personalnummer,
      person.aktiv ? person.name : `${person.name} (ausgetreten)`,
      person.ferienanspruch,
      person.jahr.ferien,
      person.ferienanspruch - person.jahr.ferien,
      person.ferienSaldo,
      alsExcelDatum(person.ferienSaldoStand),
    ]);
  }

  ferien.push([]);
  ferien.push([
    null,
    "Hinweis: 'Anspruch minus bezogen' ist keine Saldoberechnung. Übertrag aus dem " +
      "Vorjahr, anteiliger Anspruch bei Ein- oder Austritt und Halbtage sind nicht " +
      "berücksichtigt. Der übernommene Saldo stammt aus dem Excel und gilt per Stichtag.",
  ]);

  // NICHT "Ferien": so heisst schon das Blatt mit den Monatswerten. Zwei
  // Blaetter mit demselben Namen lehnt Excel ab, mappe() haengt dann eine
  // 2 an, und niemand weiss mehr, welches welches ist.
  blaetter.push({
    name: "Ferien Anspruch",
    blatt: blatt({
      zeilen: ferien,
      breiten: [10, 26, 15, 14, 21, 18, 12],
      formate: { 2: F_STUNDEN, 3: F_STUNDEN, 4: F_STUNDEN, 5: F_STUNDEN, 6: F_DATUM },
      datenAb: ferienAb,
    }),
  });

  return mappe(blaetter);
}

export async function uebersichtsmappeFuerJahr(jahr: number, alleZeigen: boolean): Promise<Buffer> {
  return uebersichtsmappe(await jahresuebersicht(jahr, alleZeigen));
}
