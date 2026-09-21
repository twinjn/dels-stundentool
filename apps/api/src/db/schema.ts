/**
 * Datenbankschema.
 *
 * Diese Datei ist die einzige Wahrheit ueber den Aufbau der Datenbank.
 * Aus ihr erzeugt drizzle-kit die Migrationen, und aus ihr leitet
 * TypeScript die Typen ab. Wer hier eine Spalte umbenennt, bekommt
 * ueberall dort einen Fehler angezeigt, wo sie benutzt wird.
 *
 * ZAHLENTYPEN: Geld und Stunden liegen als "numeric", NIE als
 * Gleitkommazahl. 0.1 + 0.2 ergibt in Gleitkomma 0.30000000000000004.
 * Bei einer Lohnabrechnung ist das keine Spitzfindigkeit, sondern ein
 * falscher Betrag auf einem Lohnausweis. Drizzle liefert numeric-Werte
 * deshalb als Zeichenkette aus, damit unterwegs nichts gerundet wird.
 *
 * Die Nachkommastellen sind an den echten Bestandsdaten geprueft:
 * Saetze brauchen 6 (BU = 0.014494), Geld und Stunden brauchen 2.
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
/** Prozentsatz als Dezimalzahl, z.B. 0.014494 fuer 1.4494 %. */
const satz = (name: string) => numeric(name, { precision: 10, scale: 6 });
/** Stundenzahl. */
const stunden = (name: string) => numeric(name, { precision: 8, scale: 2 });

const erstelltAm = timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow();

// --- Aufzaehlungen -------------------------------------------------------

export const rolleEnum = pgEnum("rolle", ["admin", "buero"]);

export const eintragsartEnum = pgEnum("eintragsart", [
  "arbeit",
  "ferien",
  "krankheit",
  "unfall",
  "feiertag",
  "sonstiges",
  "spesen",
]);

export const verteilschluesselEnum = pgEnum("verteilschluessel", ["abos", "objekt"]);

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
    // Statt loeschen: stilllegen. Ein geloeschter Benutzer wuerde seine
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
  ferienanspruch: numeric("ferienanspruch", { precision: 5, scale: 2 }).notNull().default("25"),
  sollProTag: numeric("soll_pro_tag", { precision: 5, scale: 2 }).notNull().default("8.4"),

  // Lohn (nur fuer die Rolle admin sichtbar)
  stundenlohn: geld("stundenlohn"),
  monatslohn: geld("monatslohn"),

  // Kontakt
  telefon: text("telefon"),
  email: text("email"),
  strasse: text("strasse"),
  plz: text("plz"),
  ort: text("ort"),

  // Personendaten
  geburtsdatum: date("geburtsdatum"),
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
  /** Standardpreis pro Monat. Pro Monat ueberschreibbar. */
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

    // RESTRICT statt CASCADE, bewusst anders als im Altsystem: dort haette
    // das Loeschen eines Mitarbeiters alle seine erfassten Stunden
    // mitgerissen. Lohnrelevante Daten loescht man nicht aus Versehen,
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

    /** Wer hat das eingetragen. Fuer Rueckfragen und das Protokoll. */
    erfasstVon: uuid("erfasst_von").references(() => benutzer.id, { onDelete: "set null" }),
    erstelltAm,
    geaendertAm: timestamp("geaendert_am", { withTimezone: true }),
  },
  (t) => [
    index("eintraege_mitarbeiter_datum_idx").on(t.mitarbeiterId, t.datum),
    index("eintraege_datum_idx").on(t.datum),
    index("eintraege_objekt_idx").on(t.objektId),
    // Gearbeitete Stunden ohne Objekt waeren in der Kalkulation nicht
    // zuzuordnen und wuerden aus dem Deckungsbeitrag verschwinden.
    check(
      "eintraege_arbeit_braucht_objekt",
      sql`${t.art} <> 'arbeit' OR ${t.objektId} IS NOT NULL`,
    ),
  ],
);

// --- Kalkulation ---------------------------------------------------------

/**
 * Ansaetze pro Monat. Der Kern des Ganzen: pro Monat wird festgehalten,
 * welche Saetze damals galten. Sonst rechnet man alte Monate mit heutigen
 * Saetzen nach, und genau dieser Fehler steckte im urspruenglichen Excel.
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
   * Nach Art. 91 UVG traegt die NBU-Praemie der Arbeitnehmer. Nur wenn die
   * Firma sie freiwillig uebernimmt, ist sie eine Arbeitgeberkost.
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
    /** Rueckfallwert, solange fuer dieses Objekt keine Stunden erfasst sind. */
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
 * Nur Festpersonal ohne direkten Objektbezug. Wer ueber das Stundentool
 * auf Objekte bucht, erscheint hier nicht, sonst waere der Lohn doppelt.
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
