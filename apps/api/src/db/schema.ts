/**
 * Datenbankschema.
 *
 * Diese Datei ist die einzige Wahrheit über den Aufbau der Datenbank.
 * Aus ihr erzeugt drizzle-kit die Migrationen, und aus ihr leitet
 * TypeScript die Typen ab. Wer hier eine Spalte umbenennt, bekommt
 * überall dort einen Fehler angezeigt, wo sie benutzt wird.
 *
 * ZAHLENTYPEN: Geld und Stunden liegen als "numeric", NIE als
 * Gleitkommazahl. 0.1 + 0.2 ergibt in Gleitkomma 0.30000000000000004.
 * Bei einer Lohnabrechnung ist das keine Spitzfindigkeit, sondern ein
 * falscher Betrag auf einem Lohnausweis. Drizzle liefert numeric-Werte
 * deshalb als Zeichenkette aus, damit unterwegs nichts gerundet wird.
 *
 * Die Nachkommastellen sind an den echten Bestandsdaten geprüft:
 * Sätze brauchen 6 (BU = 0.014494), Geld und Stunden brauchen 2.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// --- Hilfsdefinitionen ---------------------------------------------------

/** Geldbetrag in CHF. */
const geld = (name: string) => numeric(name, { precision: 12, scale: 2 });
/** Prozentsatz als Dezimalzahl, z.B. 0.014494 für 1.4494 %. */
const satz = (name: string) => numeric(name, { precision: 10, scale: 6 });
/** Stundenzahl. */
const stunden = (name: string) => numeric(name, { precision: 8, scale: 2 });

const erstelltAm = timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow();

// --- Aufzählungen -------------------------------------------------------

export const rolleEnum = pgEnum("rolle", ["admin", "buero"]);

export const eintragsartEnum = pgEnum("eintragsart", [
  "arbeit",
  "ferien",
  "krankheit",
  "unfall",
  "feiertag",
  // "Frei" im Sinne von arbeitsfrei, aber nicht Ferien: im bestehenden
  // Excel als "Fr" geführt und dort 200-mal verwendet. Ohne eigene
  // Kategorie müsste man es unter "sonstiges" verstecken und könnte es
  // nachher nicht mehr auseinanderhalten.
  "frei",
  "sonstiges",
  "spesen",
]);

export const verteilschluesselEnum = pgEnum("verteilschluessel", ["abos", "objekt"]);

/**
 * Wie jemand entlöhnt wird. Steuert die Ferienrechnung, und zwar
 * grundlegend, nicht nur im Detail:
 *
 *   monat   Ferien sind Tage. Es gibt einen Anspruch, einen Bezug und
 *           einen Rest, der ins nächste Jahr laeuft.
 *   stunde  Ferien sind Geld. Der Anspruch wird als Zuschlag auf den
 *           Stundenlohn ausbezahlt (bei 5 Wochen 10.638 %), einen
 *           Saldo in Tagen gibt es nicht.
 *
 * Bis hierher steckte die Unterscheidung in "mitarbeiterstufe", einem
 * Freitextfeld aus dem Excel, das an einer Stelle gegen die Zeichenkette
 * "Monatslohn" verglichen wurde. Ein Tippfehler oder ein "Monatslohn 80%"
 * hätte dort still das Falsche gerechnet. Eine Aufzählung kann das
 * nicht: was nicht in der Liste steht, nimmt die Datenbank nicht an.
 */
export const lohnartEnum = pgEnum("lohnart", ["monat", "stunde"]);

// --- Benutzer und Sitzungen ---------------------------------------------

export const benutzer = pgTable(
  "benutzer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    // argon2id-Hash. Das Passwort selbst wird nirgends gespeichert.
    passwortHash: text("passwort_hash").notNull(),
    name: text("name").notNull(),
    rolle: rolleEnum("rolle").notNull().default("buero"),
    // Statt löschen: stilllegen. Ein gelöschter Benutzer würde seine
    // Spur im Protokoll verlieren.
    aktiv: boolean("aktiv").notNull().default(true),
    erstelltAm,
    letzterLoginAm: timestamp("letzter_login_am", { withTimezone: true }),
  },
  (t) => [
    // Auf lower(email), damit "Max@dels.ch" und "max@dels.ch" nicht zwei
    // verschiedene Konten werden.
    uniqueIndex("benutzer_email_eindeutig").on(sql`lower(${t.email})`),
  ],
);

export const sitzungen = pgTable(
  "sitzungen",
  {
    // Gespeichert wird der HASH des Session-Tokens, nicht das Token selbst.
    // Wer die Datenbank liest, kann sich damit trotzdem nicht anmelden.
    id: text("id").primaryKey(),
    benutzerId: uuid("benutzer_id")
      .notNull()
      .references(() => benutzer.id, { onDelete: "cascade" }),
    erstelltAm,
    laeuftAbAm: timestamp("laeuft_ab_am", { withTimezone: true }).notNull(),
    letzteAktivitaet: timestamp("letzte_aktivitaet", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    browser: text("browser"),
  },
  (t) => [
    index("sitzungen_benutzer_idx").on(t.benutzerId),
    index("sitzungen_ablauf_idx").on(t.laeuftAbAm),
  ],
);

// --- Stammdaten ----------------------------------------------------------

export const mitarbeiter = pgTable("mitarbeiter", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),

  // Anstellung
  personalnummer: text("personalnummer"),
  mitarbeiterstufe: text("mitarbeiterstufe"),
  eintrittsdatum: date("eintrittsdatum"),
  austrittsdatum: date("austrittsdatum"),
  aktiv: boolean("aktiv").notNull().default(true),

  // Arbeitszeit und Ferien
  lohnart: lohnartEnum("lohnart").notNull().default("stunde"),
  ferienanspruch: numeric("ferienanspruch", { precision: 5, scale: 2 }).notNull().default("25"),
  sollProTag: numeric("soll_pro_tag", { precision: 5, scale: 2 }).notNull().default("8.4"),

  /**
   * Ferien-Saldo, wie er bei der Übernahme aus dem Excel galt, mit dem
   * Stichtag dazu.
   *
   * Das ist der STARTWERT der laufenden Rechnung, nicht ihr Ergebnis.
   * Vor dem Stichtag liegen Jahre, die nur im Excel existieren und die
   * niemand nachrechnen kann. Ab dem Stichtag rechnet ferien/saldo.ts
   * Jahr für Jahr weiter: Anspruch plus Übertrag minus Bezug.
   *
   * Fehlt der Wert, beginnt die Rechnung beim Eintrittsjahr.
   */
  ferienSaldo: numeric("ferien_saldo", { precision: 6, scale: 2 }),
  ferienSaldoStand: date("ferien_saldo_stand"),

  // Lohn (nur für die Rolle admin sichtbar)
  stundenlohn: geld("stundenlohn"),
  monatslohn: geld("monatslohn"),

  /** Manager, Aussendienst, Teamleiter, Büro, Hauswart, UHR I-III, Temporaer. */
  funktion: text("funktion"),
  einsatzort: text("einsatzort"),
  gruppe: text("gruppe"),

  // Kontakt
  anrede: text("anrede"),
  telefon: text("telefon"),
  mobil: text("mobil"),
  email: text("email"),
  strasse: text("strasse"),
  plz: text("plz"),
  ort: text("ort"),

  // Personendaten
  geburtsdatum: date("geburtsdatum"),
  nationalitaet: text("nationalitaet"),
  ahvNummer: text("ahv_nummer"),
  iban: text("iban"),

  notizen: text("notizen"),
  erstelltAm,
});

export const objekte = pgTable("objekte", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  objektNr: text("objekt_nr"),
  kunde: text("kunde"),
  strasse: text("strasse"),
  plz: text("plz"),
  ort: text("ort"),
  /** Standardpreis pro Monat. Pro Monat überschreibbar. */
  aboBetrag: geld("abo_betrag"),
  aktiv: boolean("aktiv").notNull().default(true),
  notizen: text("notizen"),
  erstelltAm,
});

// --- Stundenerfassung ----------------------------------------------------

export const eintraege = pgTable(
  "eintraege",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // RESTRICT statt CASCADE, bewusst anders als im Altsystem: dort hätte
    // das Löschen eines Mitarbeiters alle seine erfassten Stunden
    // mitgerissen. Lohnrelevante Daten löscht man nicht aus Versehen,
    // man legt den Mitarbeiter still (aktiv = false).
    mitarbeiterId: uuid("mitarbeiter_id")
      .notNull()
      .references(() => mitarbeiter.id, { onDelete: "restrict" }),

    objektId: uuid("objekt_id").references(() => objekte.id, { onDelete: "restrict" }),

    datum: date("datum").notNull(),
    art: eintragsartEnum("art").notNull(),
    /** Stunden bei "arbeit", Tage bei Absenzen, CHF bei "spesen". */
    wert: numeric("wert", { precision: 10, scale: 2 }).notNull(),
    notiz: text("notiz"),

    /** Wer hat das eingetragen. Für Rückfragen und das Protokoll. */
    erfasstVon: uuid("erfasst_von").references(() => benutzer.id, { onDelete: "set null" }),
    erstelltAm,
    geaendertAm: timestamp("geaendert_am", { withTimezone: true }),
  },
  (t) => [
    index("eintraege_mitarbeiter_datum_idx").on(t.mitarbeiterId, t.datum),
    index("eintraege_datum_idx").on(t.datum),
    index("eintraege_objekt_idx").on(t.objektId),
    // Gearbeitete Stunden ohne Objekt wären in der Kalkulation nicht
    // zuzuordnen und würden aus dem Deckungsbeitrag verschwinden.
    check(
      "eintraege_arbeit_braucht_objekt",
      sql`${t.art} <> 'arbeit' OR ${t.objektId} IS NOT NULL`,
    ),
  ],
);

// --- Kalkulation ---------------------------------------------------------

/**
 * Ansätze pro Monat. Der Kern des Ganzen: pro Monat wird festgehalten,
 * welche Sätze damals galten. Sonst rechnet man alte Monate mit heutigen
 * Sätzen nach, und genau dieser Fehler steckte im ursprünglichen Excel.
 */
export const kalkMonat = pgTable("kalk_monat", {
  /** Immer der erste Tag des Monats. */
  monat: date("monat").primaryKey(),

  ahv: satz("ahv").notNull().default("0.053"),
  alv: satz("alv").notNull().default("0.011"),
  nbu: satz("nbu").notNull().default("0.0138"),
  bu: satz("bu").notNull().default("0.014494"),
  ktgObjekt: satz("ktg_objekt").notNull().default("0.00796"),
  ktgPersonal: satz("ktg_personal").notNull().default("0.00825"),
  rpk: satz("rpk").notNull().default("0.002"),
  fak: satz("fak").notNull().default("0.012"),
  ml13: satz("ml13").notNull().default("0.0833"),

  /** Stunden pro Woche, ab denen die NBU-Pflicht greift. */
  nbuSchwelle: stunden("nbu_schwelle").notNull().default("8"),
  /**
   * Nach Art. 91 UVG trägt die NBU-Praemie der Arbeitnehmer. Nur wenn die
   * Firma sie freiwillig übernimmt, ist sie eine Arbeitgeberkost.
   */
  nbuTraegtAg: boolean("nbu_traegt_ag").notNull().default(false),

  bvgSatz: satz("bvg_satz").notNull().default("0.07"),
  bvgEintritt: geld("bvg_eintritt").notNull().default("22680"),
  bvgKoord: geld("bvg_koord").notNull().default("26460"),
  bvgMin: geld("bvg_min").notNull().default("3780"),
  bvgMax: geld("bvg_max").notNull().default("64260"),

  /** Material und Maschinen, CHF pro Objekt. */
  mat: geld("mat").notNull().default("15"),
  mas: geld("mas").notNull().default("15"),
  /** Treibstoff: Pauschale pro Objekt und zu verteilender Topf. */
  trs: geld("trs").notNull().default("0"),
  trsTopf: geld("trs_topf").notNull().default("0"),
  trsSchluessel: verteilschluesselEnum("trs_schluessel").notNull().default("abos"),

  adminReserve: satz("admin_reserve").notNull().default("0.10"),

  notiz: text("notiz"),

  /**
   * Gesetzt, sobald der Monat als erledigt gilt. Ab da nimmt die API
   * keine Änderungen mehr an diesem Monat an.
   *
   * Der Grund ist nicht Misstrauen, sondern Nachvollziehbarkeit: die
   * Zahlen, die einmal an den Treuhänder gegangen sind, müssen sich
   * später wieder genau so herstellen lassen. Ein Monat, den jemand
   * still nachbessert, ist keine Grundlage mehr für irgendetwas.
   *
   * Wieder aufmachen geht, aber nur mit dem Recht dazu und mit einer
   * Spur im Protokoll.
   */
  abgeschlossenAm: timestamp("abgeschlossen_am", { withTimezone: true }),
  /** Klartextname, bleibt auch erhalten, wenn das Konto verschwindet. */
  abgeschlossenVon: text("abgeschlossen_von"),

  erstelltAm,
});

export const kalkAdminkosten = pgTable(
  "kalk_adminkosten",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monat: date("monat")
      .notNull()
      .references(() => kalkMonat.monat, { onDelete: "cascade" }),
    position: text("position").notNull(),
    betrag: geld("betrag").notNull().default("0"),
    sortierung: integer("sortierung").notNull().default(0),
  },
  (t) => [index("kalk_adminkosten_monat_idx").on(t.monat)],
);

export const kalkObjektMonat = pgTable(
  "kalk_objekt_monat",
  {
    monat: date("monat")
      .notNull()
      .references(() => kalkMonat.monat, { onDelete: "cascade" }),
    objektId: uuid("objekt_id")
      .notNull()
      .references(() => objekte.id, { onDelete: "restrict" }),
    aboBetrag: geld("abo_betrag"),
    /** Rückfallwert, solange für dieses Objekt keine Stunden erfasst sind. */
    stdManuell: stunden("std_manuell"),
    /** Ansatz, wenn ohne Stundendaten gerechnet wird. */
    lohnManuell: geld("lohn_manuell"),
    /** Anzahl eingesetzter Mitarbeiter. */
    ma: numeric("ma", { precision: 6, scale: 2 }).notNull().default("1"),
    aktiv: boolean("aktiv").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.monat, t.objektId] })],
);

/**
 * Nur Festpersonal ohne direkten Objektbezug. Wer über das Stundentool
 * auf Objekte bucht, erscheint hier nicht, sonst wäre der Lohn doppelt.
 */
export const kalkPersonMonat = pgTable(
  "kalk_person_monat",
  {
    monat: date("monat")
      .notNull()
      .references(() => kalkMonat.monat, { onDelete: "cascade" }),
    mitarbeiterId: uuid("mitarbeiter_id")
      .notNull()
      .references(() => mitarbeiter.id, { onDelete: "restrict" }),
    lohn: geld("lohn").notNull().default("0"),
    spesen: geld("spesen").notNull().default("0"),
    ml13: boolean("ml13").notNull().default(false),
    abzugAhv: boolean("abzug_ahv").notNull().default(true),
    abzugAlv: boolean("abzug_alv").notNull().default(true),
    abzugRpk: boolean("abzug_rpk").notNull().default(true),
    abzugFak: boolean("abzug_fak").notNull().default(true),
    fakManuell: geld("fak_manuell"),
    bvg: boolean("bvg").notNull().default(true),
    bvgManuell: geld("bvg_manuell"),
  },
  (t) => [primaryKey({ columns: [t.monat, t.mitarbeiterId] })],
);

/**
 * Ferientage, die aus dem Vorjahr ins Jahr "jahr" mitgenommen werden.
 *
 * Normalerweise steht hier NICHTS. Der Übertrag wird gerechnet: was am
 * 31. Dezember übrig war, ist am 1. Januar da. Ein Datensatz hier ist
 * die Ausnahme und übersteuert die Rechnung.
 *
 * Warum herum, und nicht andersherum:
 *
 * Der naheliegende Entwurf wäre, den Saldo jedes Jahr auf null zu
 * setzen und den Übertrag von Hand nachzutragen. Dann kostet einmal
 * Vergessen im Januar jemandem seine Ferientage, still und ohne Spur.
 * So herum kostet Vergessen gar nichts, und das Streichen ist eine
 * bewusste Handlung mit Begründung und Namen daran.
 *
 * Ein Eintrag mit tage = 0 ist also die Aussage "der Rest verfällt",
 * und die Bemerkung sagt warum.
 */
export const ferienUebertrag = pgTable(
  "ferien_uebertrag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mitarbeiterId: uuid("mitarbeiter_id")
      .notNull()
      .references(() => mitarbeiter.id, { onDelete: "cascade" }),
    /** Das Jahr, IN das übertragen wird. 2027 heisst: Rest aus 2026. */
    jahr: integer("jahr").notNull(),
    tage: numeric("tage", { precision: 6, scale: 2 }).notNull(),
    bemerkung: text("bemerkung"),
    /** Klartextname, bleibt auch erhalten, wenn das Konto verschwindet. */
    erfasstVon: text("erfasst_von"),
    erstelltAm,
  },
  (t) => [
    uniqueIndex("ferien_uebertrag_person_jahr_idx").on(t.mitarbeiterId, t.jahr),
    // Ein Übertrag von 3000 Tagen ist ein Tippfehler, kein Sonderfall.
    check("ferien_uebertrag_tage_grenzen", sql`${t.tage} between -100 and 100`),
  ],
);

/**
 * Abo-Preise eines Objekts mit Gültigkeitsdatum.
 *
 * Warum nicht einfach ein Betrag am Objekt: der Preis ändert sich, die
 * Vergangenheit nicht. Steht nur ein Wert am Objekt, dann verschiebt
 * eine Preiserhöhung im Oktober rückwirkend auch den Februar, sobald
 * jemand den Monat neu anlegt oder abgleicht.
 *
 * Hier steht deshalb, ab wann welcher Preis gilt. Ein neuer
 * Kalkulationsmonat nimmt den Preis, der an seinem Ersten gültig war.
 *
 * objekte.aboBetrag bleibt als aktueller Preis bestehen und wird aus
 * dieser Tabelle nachgeführt. Doppelt gehalten, aber die eine Seite ist
 * eindeutig die Quelle: diese hier.
 */
export const objektAbo = pgTable(
  "objekt_abo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objektId: uuid("objekt_id")
      .notNull()
      .references(() => objekte.id, { onDelete: "cascade" }),
    /** Ab diesem Tag gilt der Betrag, bis ihn ein späterer ablöst. */
    gueltigAb: date("gueltig_ab").notNull(),
    betrag: geld("betrag").notNull(),
    bemerkung: text("bemerkung"),
    erfasstVon: text("erfasst_von"),
    erstelltAm,
  },
  (t) => [
    // Zwei Preise am selben Tag für dasselbe Objekt wären nicht
    // entscheidbar. Wer korrigieren will, ändert den vorhandenen.
    uniqueIndex("objekt_abo_objekt_tag_idx").on(t.objektId, t.gueltigAb),
    index("objekt_abo_objekt_idx").on(t.objektId, t.gueltigAb),
  ],
);

// --- Protokoll -----------------------------------------------------------

/**
 * Wer hat wann was geaendert. Bei Lohn- und Personendaten ist das kein
 * Luxus: es beantwortet die Frage "wer hat diesen Betrag angefasst",
 * bevor sie zum Streit wird.
 */
export const protokoll = pgTable(
  "protokoll",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    zeitpunkt: timestamp("zeitpunkt", { withTimezone: true }).notNull().defaultNow(),
    benutzerId: uuid("benutzer_id").references(() => benutzer.id, { onDelete: "set null" }),
    /** Klartextname, bleibt auch erhalten, wenn das Konto verschwindet. */
    benutzerName: text("benutzer_name"),
    aktion: text("aktion").notNull(),
    tabelle: text("tabelle").notNull(),
    datensatzId: text("datensatz_id"),
    vorher: jsonb("vorher"),
    nachher: jsonb("nachher"),
  },
  (t) => [
    index("protokoll_zeitpunkt_idx").on(t.zeitpunkt),
    index("protokoll_tabelle_idx").on(t.tabelle, t.datensatzId),
  ],
);
