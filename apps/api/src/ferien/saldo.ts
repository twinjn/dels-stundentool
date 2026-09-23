/**
 * Ferienstand je Mitarbeiter für ein Jahr.
 *
 * Holt die Daten und wendet die Regeln aus rechnung.ts an. Die Trennung
 * ist Absicht: dort stehen die Firmenregeln, hier die Abfragen.
 *
 * WIE DER SALDO ENTSTEHT, in einem Satz: was am 31. Dezember übrig
 * war, ist am 1. Januar da. Der Übertrag wird also gerechnet und nicht
 * eingetippt. Wer ihn streichen will, legt einen Datensatz in
 * ferien_uebertrag an, und der trägt dann einen Namen und eine
 * Begründung.
 *
 * WARUM DIE SUMMEN IN JAVASCRIPT GEBILDET WERDEN und nicht per GROUP BY:
 * Die Rechnung braucht pro Person ein Jahr-für-Jahr-Fortschreiben und
 * einen Vergleich gegen den persönlichen Stichtag. In SQL wäre das
 * eine Abfrage mit rohen Bausteinen in der SELECT-Liste, und genau dort
 * setzt Drizzle keine Tabellenpräfixe. Dieses Projekt hat sich daran
 * schon einmal eine still falsche Zahl eingehandelt (siehe den langen
 * Kommentar in routes/dashboard.ts). Die Datenmenge gibt das her: es
 * sind die Ferieneinträge weniger Jahre, keine Bewegungsdaten.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { eintraege, ferienUebertrag, mitarbeiter } from "../db/schema.js";
import { ferienentschaedigung, ferienzuschlag, jahresanspruch } from "./rechnung.js";

/**
 * Wie weit zurück höchstens gerechnet wird, wenn weder ein Stichtag
 * noch ein Eintrittsdatum hinterlegt ist. Ohne Grenze würde die
 * Schleife bei einer kaputten Jahreszahl ewig laufen.
 */
const MAX_JAHRE_ZURUECK = 10;

export type FerienMonatslohn = {
  art: "monat";
  id: string;
  name: string;
  jahr: number;
  /** Anspruch für dieses Jahr, bei Ein- oder Austritt anteilig. */
  anspruch: number;
  /** Der volle Jahresanspruch, zum Vergleich. */
  anspruchVoll: number;
  anteilig: boolean;
  uebertrag: number;
  /** Wurde der Übertrag von Hand gesetzt statt gerechnet? */
  uebertragGesetzt: boolean;
  uebertragBemerkung: string | null;
  bezogen: number;
  rest: number;
  /**
   * Der Übertrag wurde aus der Historie gerechnet, ohne dass es einen
   * Stichtag gibt, ab dem der Saldo als gesichert gilt.
   *
   * Das ist ein Warnschild, keine Fehlermeldung. Wer 2021 eingetreten
   * ist und dessen Ferien erst ab 2026 im Tool stehen, bekommt hier für
   * die Jahre davor den vollen Anspruch gutgeschrieben, weil dort keine
   * Bezüge erfasst sind. Die Rechnung ist formal richtig und das
   * Ergebnis trotzdem Unsinn, denn die Lücke ist fehlende Erfassung und
   * kein nicht bezogener Urlaub.
   *
   * Die Lösung ist ein Stichtag mit übernommenem Saldo pro Person.
   * Solange der fehlt, sagt das Tag der Oberfläche, dass sie die Zahl
   * nicht als bare Münze verkaufen soll.
   */
  verlaufUnvollstaendig: boolean;
};

export type FerienStundenlohn = {
  art: "stunde";
  id: string;
  name: string;
  jahr: number;
  anspruchVoll: number;
  wochen: number;
  /** Zuschlag als Anteil, 0.10638 heisst 10.638 %. */
  zuschlag: number;
  /** Erfasste Arbeitsstunden im Jahr. */
  stunden: number;
  /** Bruttolohn als Basis, null wenn kein Stundenlohn hinterlegt ist. */
  basis: number | null;
  entschaedigung: number | null;
  /** Bezogene Ferientage, nur zur Information. Kein Soll dagegen. */
  bezogen: number;
};

export type FerienZeile = FerienMonatslohn | FerienStundenlohn;

const zahl = (wert: string | null | undefined): number => Number(wert ?? 0);
const jahrVon = (datum: string): number => Number(datum.slice(0, 4));

/**
 * Ab welchem Jahr für eine Person gerechnet wird.
 *
 * Der Stichtag gewinnt: ab dort gibt es einen übernommenen Saldo, und
 * was davor liegt, steht nur im alten Excel und lässt sich nicht
 * nachrechnen. Ohne Stichtag zählt das Eintrittsjahr.
 */
function startjahr(zieljahr: number, stand: string | null, eintritt: string | null): number {
  const grenze = zieljahr - MAX_JAHRE_ZURUECK;
  if (stand) return Math.max(jahrVon(stand), grenze);
  if (eintritt) return Math.max(jahrVon(eintritt), grenze);
  return zieljahr;
}

type Person = typeof mitarbeiter.$inferSelect;

/**
 * Rechnet den Stand einer Person im Monatslohn für ein Jahr aus, indem
 * sie vom Startjahr an Jahr für Jahr fortgeschrieben wird.
 *
 * @param bezogenJeJahr  bezogene Ferientage, Jahr -> Tage
 * @param nachStichtag   im Stichtagsjahr: nur was NACH dem Stichtag bezogen wurde
 * @param manuell        gesetzte Überträge, Jahr -> Datensatz
 */
function fortschreiben(
  person: Person,
  zieljahr: number,
  bezogenJeJahr: Map<number, number>,
  nachStichtag: number,
  manuell: Map<number, { tage: number; bemerkung: string | null }>,
): FerienMonatslohn {
  const anspruchVoll = zahl(person.ferienanspruch);
  const stand = person.ferienSaldoStand;
  const von = startjahr(zieljahr, stand, person.eintrittsdatum);

  let uebertrag = 0;
  let uebertragGesetzt = false;
  let uebertragBemerkung: string | null = null;
  let anspruch = 0;
  let anteilig = false;
  let bezogen = 0;

  for (let jahr = von; jahr <= zieljahr; jahr++) {
    const gesetzt = manuell.get(jahr);
    if (gesetzt) {
      uebertrag = gesetzt.tage;
      uebertragGesetzt = true;
      uebertragBemerkung = gesetzt.bemerkung;
    } else {
      uebertragGesetzt = false;
      uebertragBemerkung = null;
    }

    if (stand && jahr === jahrVon(stand) && !gesetzt) {
      /*
       * Das Jahr, in dem der Saldo aus dem Excel übernommen wurde.
       *
       * Hier wird KEIN Jahresanspruch dazugerechnet: der übernommene
       * Saldo ist bereits der Rest nach dem Anspruch dieses Jahres.
       * Würde man ihn trotzdem addieren, bekäme jeder einmalig ein
       * ganzes Jahr Ferien geschenkt.
       *
       * Und es zählt nur, was NACH dem Stichtag bezogen wurde. Was
       * davor liegt, steckt schon im Saldo drin.
       */
      anspruch = 0;
      anteilig = false;
      bezogen = nachStichtag;
      uebertrag = zahl(person.ferienSaldo);
    } else {
      const berechnet = jahresanspruch(
        anspruchVoll,
        jahr,
        person.eintrittsdatum,
        person.austrittsdatum,
      );
      anspruch = berechnet.tage;
      anteilig = berechnet.anteilig;
      bezogen = bezogenJeJahr.get(jahr) ?? 0;
    }

    const rest = uebertrag + anspruch - bezogen;

    // Ergebnis dieses Jahres ist der Übertrag ins nächste, ausser das
    // nächste Jahr setzt ihn selbst.
    if (jahr < zieljahr) uebertrag = rest;
  }

  return {
    art: "monat",
    id: person.id,
    name: person.name,
    jahr: zieljahr,
    verlaufUnvollstaendig: !stand && von < zieljahr,
    anspruch,
    anspruchVoll,
    anteilig,
    uebertrag,
    uebertragGesetzt,
    uebertragBemerkung,
    bezogen,
    rest: uebertrag + anspruch - bezogen,
  };
}

/** Ferienstand aller aktiven Mitarbeiter für ein Jahr. */
export async function ferienstand(zieljahr: number): Promise<FerienZeile[]> {
  const personen = await db
    .select()
    .from(mitarbeiter)
    .where(eq(mitarbeiter.aktiv, true))
    .orderBy(asc(sql`${mitarbeiter.name} collate "de-CH-x-icu"`));

  if (personen.length === 0) return [];

  // Wie weit muss zurückgeschaut werden, damit jede Person ihre
  // Vorjahre hat? Eine Abfrage für alle, statt einer pro Person.
  const aeltestesJahr = Math.min(
    ...personen.map((p) => startjahr(zieljahr, p.ferienSaldoStand, p.eintrittsdatum)),
  );

  const ids = personen.map((p) => p.id);

  const [ferientage, arbeitsstunden, uebertraege] = await Promise.all([
    db
      .select({
        mitarbeiterId: eintraege.mitarbeiterId,
        datum: eintraege.datum,
        wert: eintraege.wert,
      })
      .from(eintraege)
      .where(
        and(
          inArray(eintraege.mitarbeiterId, ids),
          eq(eintraege.art, "ferien"),
          gte(eintraege.datum, `${aeltestesJahr}-01-01`),
          lte(eintraege.datum, `${zieljahr}-12-31`),
        ),
      ),

    // Für die Stundenlöhner: Arbeitsstunden des Zieljahres als Basis
    // der Ferienentschaedigung.
    db
      .select({ mitarbeiterId: eintraege.mitarbeiterId, wert: eintraege.wert })
      .from(eintraege)
      .where(
        and(
          inArray(eintraege.mitarbeiterId, ids),
          eq(eintraege.art, "arbeit"),
          gte(eintraege.datum, `${zieljahr}-01-01`),
          lte(eintraege.datum, `${zieljahr}-12-31`),
        ),
      ),

    db
      .select()
      .from(ferienUebertrag)
      .where(
        and(
          inArray(ferienUebertrag.mitarbeiterId, ids),
          gte(ferienUebertrag.jahr, aeltestesJahr),
          lte(ferienUebertrag.jahr, zieljahr),
        ),
      ),
  ]);

  // --- Aufbereiten -------------------------------------------------------

  const ferienJePerson = new Map<string, Map<number, number>>();
  const nachStichtagJePerson = new Map<string, number>();
  const stichtagJePerson = new Map(personen.map((p) => [p.id, p.ferienSaldoStand]));

  for (const zeile of ferientage) {
    const jahre = ferienJePerson.get(zeile.mitarbeiterId) ?? new Map<number, number>();
    const jahr = jahrVon(zeile.datum);
    jahre.set(jahr, (jahre.get(jahr) ?? 0) + zahl(zeile.wert));
    ferienJePerson.set(zeile.mitarbeiterId, jahre);

    /*
     * Stichtagsvergleich als Zeichenkettenvergleich. Das ist kein Trick,
     * sondern nutzt aus, dass "JJJJ-MM-TT" in der alphabetischen
     * Reihenfolge derselben Reihenfolge folgt wie im Kalender. Kein
     * Date-Objekt, also auch keine Zeitzone, die ein Datum um einen Tag
     * verschiebt.
     */
    const stichtag = stichtagJePerson.get(zeile.mitarbeiterId);
    if (stichtag && jahr === jahrVon(stichtag) && zeile.datum > stichtag) {
      nachStichtagJePerson.set(
        zeile.mitarbeiterId,
        (nachStichtagJePerson.get(zeile.mitarbeiterId) ?? 0) + zahl(zeile.wert),
      );
    }
  }

  const stundenJePerson = new Map<string, number>();
  for (const zeile of arbeitsstunden) {
    stundenJePerson.set(
      zeile.mitarbeiterId,
      (stundenJePerson.get(zeile.mitarbeiterId) ?? 0) + zahl(zeile.wert),
    );
  }

  const uebertragJePerson = new Map<
    string,
    Map<number, { tage: number; bemerkung: string | null }>
  >();
  for (const zeile of uebertraege) {
    const jahre = uebertragJePerson.get(zeile.mitarbeiterId) ?? new Map();
    jahre.set(zeile.jahr, { tage: zahl(zeile.tage), bemerkung: zeile.bemerkung });
    uebertragJePerson.set(zeile.mitarbeiterId, jahre);
  }

  // --- Rechnen -----------------------------------------------------------

  return personen.map((person): FerienZeile => {
    const ferien = ferienJePerson.get(person.id) ?? new Map<number, number>();

    if (person.lohnart === "monat") {
      return fortschreiben(
        person,
        zieljahr,
        ferien,
        nachStichtagJePerson.get(person.id) ?? 0,
        uebertragJePerson.get(person.id) ?? new Map(),
      );
    }

    const anspruchVoll = zahl(person.ferienanspruch);
    const { wochen, anteil } = ferienzuschlag(anspruchVoll);
    const stunden = stundenJePerson.get(person.id) ?? 0;
    const lohn = person.stundenlohn ? Math.round(zahl(person.stundenlohn) * 100) : null;

    const geld = lohn && lohn > 0 ? ferienentschaedigung(stunden, lohn, anspruchVoll) : null;

    return {
      art: "stunde",
      id: person.id,
      name: person.name,
      jahr: zieljahr,
      anspruchVoll,
      wochen,
      zuschlag: anteil,
      stunden,
      basis: geld ? geld.basisRappen / 100 : null,
      entschaedigung: geld ? geld.betragRappen / 100 : null,
      bezogen: ferien.get(zieljahr) ?? 0,
    };
  });
}
