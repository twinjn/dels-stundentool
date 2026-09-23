/**
 * Die Ferienrechnung, als reine Funktionen ohne Datenbank.
 *
 * Getrennt gehalten, weil hier die Firmenregeln stehen und nicht die
 * Abfragen. Diese Datei kann man lesen, ohne Drizzle zu kennen, und
 * testen, ohne eine Datenbank zu starten.
 *
 * ZWEI WELTEN, und das ist der Kern:
 *
 *   Monatslohn   Ferien sind Tage. Anspruch, Bezug, Rest, und der Rest
 *                läuft ins nächste Jahr.
 *   Stundenlohn  Ferien sind Geld. Der Anspruch wird als Zuschlag auf
 *                den Stundenlohn ausbezahlt. Einen Saldo in Tagen gibt
 *                es nicht, und einer wäre auch falsch: die Ferien sind
 *                mit jedem Lohn schon bezahlt.
 *
 * Wer beide Gruppen über einen Kamm schert, zeigt der halben Belegschaft
 * eine Zahl, die es nicht gibt.
 */

/** Ein Datum als "JJJJ-MM-TT", so wie Postgres es liefert. */
export type Datumstext = string;

/**
 * Tagesnummer seit 1970, aus einem Datumstext.
 *
 * Bewusst über Date.UTC und nicht über new Date("2026-03-01"): der
 * zweite Weg ist zwar auch UTC, aber sobald jemand später eine Uhrzeit
 * anhängt, kippt die Auswertung in die Ortszeit und ein Datum rutscht
 * um einen Tag. Das fällt erst im Winter auf, oder nie.
 */
function tagesnummer(text: Datumstext): number {
  const [jahr, monat, tag] = text.split("-").map(Number);
  return Math.floor(Date.UTC(jahr!, monat! - 1, tag!) / 86_400_000);
}

function istSchaltjahr(jahr: number): boolean {
  return (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
}

/** Auf halbe Tage. Ferien werden halbtagsweise gewährt, nicht in Minuten. */
function aufHalbe(wert: number): number {
  return Math.round(wert * 2) / 2;
}

/**
 * Jahresanspruch in Tagen, anteilig bei Ein- oder Austritt mitten im Jahr.
 *
 * Gerechnet wird über Kalendertage, nicht über Monate. Das Ergebnis ist
 * dasselbe (Eintritt am 1. Juli, 25 Tage Anspruch, gibt 12.5), aber es
 * braucht keine Regel für den angebrochenen Monat. "Zählt der 20. März
 * als ganzer Monat?" ist eine Frage, die man sich so gar nicht erst
 * stellen muss.
 *
 * Nach Arbeitstagen zu rechnen wäre der nächste Schritt und lohnt sich
 * nicht: der Unterschied liegt bei einem halben Tag, der Aufwand bei
 * Pensen, Feiertagen und unregelmässigen Einsätzen bei einem
 * Vielfachen davon.
 */
export function jahresanspruch(
  anspruchVoll: number,
  jahr: number,
  eintritt: Datumstext | null,
  austritt: Datumstext | null,
): { tage: number; anteilig: boolean } {
  const ersterDesJahres = tagesnummer(`${jahr}-01-01`);
  const letzterDesJahres = tagesnummer(`${jahr}-12-31`);

  const von = eintritt ? Math.max(tagesnummer(eintritt), ersterDesJahres) : ersterDesJahres;
  const bis = austritt ? Math.min(tagesnummer(austritt), letzterDesJahres) : letzterDesJahres;

  // Eintritt nach dem Jahresende oder Austritt davor: gar nicht dabei.
  if (bis < von) return { tage: 0, anteilig: true };

  const beschaeftigt = bis - von + 1;
  const imJahr = istSchaltjahr(jahr) ? 366 : 365;

  if (beschaeftigt >= imJahr) return { tage: anspruchVoll, anteilig: false };

  return { tage: aufHalbe((anspruchVoll * beschaeftigt) / imJahr), anteilig: true };
}

/**
 * Ferienzuschlag auf den Stundenlohn, als Anteil (0.10638 = 10.638 %).
 *
 * Die Formel ist Ferienwochen geteilt durch Arbeitswochen, nicht durch
 * 52. Wer fünf Wochen Ferien hat, arbeitet 47 Wochen und muss in diesen
 * 47 Wochen auch die fünf mitverdienen: 5/47 = 10.638 %. Mit 5/52
 * käme 9.6 % heraus, und das ist der Klassiker unter den zu tief
 * abgerechneten Ferienzuschlägen.
 *
 * Die üblichen Werte: 4 Wochen = 8.333 %, 5 Wochen = 10.638 %,
 * 6 Wochen = 13.043 %.
 */
export function ferienzuschlag(anspruchTage: number): { wochen: number; anteil: number } {
  const wochen = anspruchTage / 5;

  // Ohne Anspruch kein Zuschlag, und 52 Wochen Ferien sind kein
  // Sonderfall, sondern ein Tippfehler. Beides fängt der Nenner ab.
  if (wochen <= 0 || wochen >= 52) return { wochen, anteil: 0 };

  return { wochen, anteil: wochen / (52 - wochen) };
}

/**
 * Ferienentschädigung in Rappen.
 *
 * In ganzen Rappen gerechnet und nicht in Franken als Gleitkommazahl.
 * Das ist derselbe Grund wie beim numeric in der Datenbank: dieser
 * Betrag landet auf einer Lohnabrechnung, und 0.1 + 0.2 ist dort nicht
 * 0.30000000000000004, sondern falsch.
 */
export function ferienentschaedigung(
  stunden: number,
  stundenlohnRappen: number,
  anspruchTage: number,
): { basisRappen: number; betragRappen: number; anteil: number } {
  const { anteil } = ferienzuschlag(anspruchTage);

  // Stunden kommen mit zwei Nachkommastellen, also in Hundertsteln
  // rechnen und erst am Schluss auf ganze Rappen runden.
  const basisRappen = Math.round((Math.round(stunden * 100) * stundenlohnRappen) / 100);

  return { basisRappen, betragRappen: Math.round(basisRappen * anteil), anteil };
}
