/**
 * Pruefregeln fuer Mitarbeiter und Objekte.
 *
 * Zahlen kommen als Zeichenkette heraus, nicht als JavaScript-Zahl.
 * Grund: die Datenbank speichert Geld und Stunden als "numeric", und
 * jeder Umweg ueber eine Gleitkommazahl kann runden. In einer
 * Lohnabrechnung ist das ein falscher Betrag, kein Rundungsfehler.
 */
import { z } from "zod";

// --- Bausteine -----------------------------------------------------------

/** Leere Eingabe wird zu null, nicht zu einem leeren Text. */
function leerZuNull(wert: unknown): string | null {
  const text = typeof wert === "number" ? String(wert) : ((wert as string | null) ?? "");
  const beschnitten = text.trim();
  return beschnitten === "" ? null : beschnitten;
}

function optionalerText(max: number) {
  return z
    .union([z.string(), z.number(), z.null()])
    .transform(leerZuNull)
    .refine((w) => w === null || w.length <= max, `Hoechstens ${max} Zeichen.`)
    .optional();
}

/**
 * Dezimalzahl, die als Zeichenkette erhalten bleibt.
 * Ein Komma wird zu einem Punkt: Schweizer tippen "1250,50".
 */
function optionaleDezimalzahl(vorkomma: number, nachkomma: number, was: string) {
  const muster = new RegExp(`^-?\\d{1,${vorkomma}}(\\.\\d{1,${nachkomma}})?$`);
  return z
    .union([z.string(), z.number(), z.null()])
    .transform((wert) => {
      const text = leerZuNull(wert);
      return text === null ? null : text.replace(",", ".").replace(/'/g, "");
    })
    .refine(
      (w) => w === null || muster.test(w),
      `${was}: Zahl mit hoechstens ${nachkomma} Nachkommastellen erwartet.`,
    )
    .optional();
}

/**
 * Wie oben, aber leere Eingabe heisst "nicht aendern" statt "auf null
 * setzen". Fuer Spalten, die in der Datenbank NOT NULL sind und einen
 * Standardwert haben: dort waere null schlicht verboten.
 */
function dezimalzahlOhneNull(vorkomma: number, nachkomma: number, was: string) {
  const muster = new RegExp(`^-?\\d{1,${vorkomma}}(\\.\\d{1,${nachkomma}})?$`);
  return z
    .union([z.string(), z.number()])
    .transform((wert) => {
      const text = leerZuNull(wert);
      return text === null ? undefined : text.replace(",", ".").replace(/'/g, "");
    })
    .refine(
      (w) => w === undefined || muster.test(w),
      `${was}: Zahl mit hoechstens ${nachkomma} Nachkommastellen erwartet.`,
    )
    .optional();
}

function istEchtesDatum(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const datum = new Date(`${text}T00:00:00Z`);
  // Faengt den 31. Februar ab: den rechnet JavaScript sonst still in den
  // 3. Maerz um.
  return !Number.isNaN(datum.getTime()) && datum.toISOString().slice(0, 10) === text;
}

function optionalesDatum(was: string) {
  return z
    .union([z.string(), z.null()])
    .transform(leerZuNull)
    .refine((w) => w === null || istEchtesDatum(w), `${was}: Datum im Format JJJJ-MM-TT erwartet.`)
    .optional();
}

// --- AHV-Nummer ----------------------------------------------------------

/** Macht aus "7561234567897" die uebliche Schreibweise 756.1234.5678.97. */
export function ahvFormatieren(eingabe: string): string {
  const ziffern = eingabe.replace(/\D/g, "");
  if (ziffern.length !== 13) return eingabe.trim();
  return `${ziffern.slice(0, 3)}.${ziffern.slice(3, 7)}.${ziffern.slice(7, 11)}.${ziffern.slice(11)}`;
}

export function ahvGueltig(eingabe: string): boolean {
  const ziffern = eingabe.replace(/\D/g, "");
  if (!/^756\d{10}$/.test(ziffern)) return false;

  // Pruefziffer nach EAN-13: von rechts abwechselnd mal 3 und mal 1.
  const stellen = ziffern.split("").map(Number);
  const pruefziffer = stellen.pop()!;
  let summe = 0;
  for (let i = stellen.length - 1, faktor = 3; i >= 0; i--, faktor = faktor === 3 ? 1 : 3) {
    summe += stellen[i]! * faktor;
  }
  return (10 - (summe % 10)) % 10 === pruefziffer;
}

// --- IBAN ----------------------------------------------------------------

/**
 * Prueft eine IBAN nach dem Modulo-97-Verfahren.
 *
 * Das ist keine Formalie: die Pruefsumme faengt Zahlendreher ab. Ohne sie
 * geht ein Lohn im schlimmsten Fall auf ein fremdes, aber existierendes
 * Konto, und zurueckholen laesst sich das kaum.
 */
export function ibanGueltig(eingabe: string): boolean {
  const iban = eingabe.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

  // Die ersten vier Zeichen nach hinten, Buchstaben zu Zahlen (A=10 ... Z=35).
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  const ziffern = umgestellt.replace(/[A-Z]/g, (b) => String(b.charCodeAt(0) - 55));

  // Stueckweise rechnen, sonst reicht die Zahlengenauigkeit nicht.
  let rest = 0;
  for (const zeichen of ziffern) {
    rest = (rest * 10 + Number(zeichen)) % 97;
  }
  return rest === 1;
}

export function ibanFormatieren(eingabe: string): string {
  const iban = eingabe.replace(/\s/g, "").toUpperCase();
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

// --- Mitarbeiter ---------------------------------------------------------

/** Muss zur Aufzaehlung "lohnart" in der Datenbank passen. */
export const LOHNARTEN = ["monat", "stunde"] as const;
export type Lohnart = (typeof LOHNARTEN)[number];

const mitarbeiterFelder = {
  name: z.string().trim().min(1, "Name fehlt.").max(120),

  personalnummer: optionalerText(40),
  mitarbeiterstufe: optionalerText(40),
  /** Manager, Aussendienst, Teamleiter, Buero, Hauswart, UHR I-III, Temporaer. */
  funktion: optionalerText(40),
  einsatzort: optionalerText(80),
  gruppe: optionalerText(40),
  anrede: optionalerText(20),
  eintrittsdatum: optionalesDatum("Eintritt"),
  austrittsdatum: optionalesDatum("Austritt"),
  aktiv: z.boolean().optional(),

  /**
   * Monats- oder Stundenlohn. Steuert die ganze Ferienrechnung, nicht
   * nur die Anzeige: im Stundenlohn gibt es keinen Saldo in Tagen,
   * sondern einen Zuschlag auf den Lohn.
   */
  lohnart: z.enum(LOHNARTEN).optional(),

  // NOT NULL in der Datenbank, deshalb ohne null.
  ferienanspruch: dezimalzahlOhneNull(3, 2, "Ferienanspruch"),
  sollProTag: dezimalzahlOhneNull(3, 2, "Soll pro Tag"),

  stundenlohn: optionaleDezimalzahl(10, 2, "Stundenlohn"),
  monatslohn: optionaleDezimalzahl(10, 2, "Monatslohn"),

  telefon: optionalerText(40),
  mobil: optionalerText(40),
  email: optionalerText(120).refine(
    (w) => w === null || w === undefined || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w),
    "Das sieht nicht nach einer E-Mail-Adresse aus.",
  ),
  strasse: optionalerText(120),
  plz: optionalerText(10),
  ort: optionalerText(80),

  geburtsdatum: optionalesDatum("Geburtsdatum"),
  nationalitaet: optionalerText(60),

  /** Aus dem Excel uebernommener Ferien-Saldo, mit dem Stand dazu. */
  ferienSaldo: optionaleDezimalzahl(4, 2, "Ferien-Saldo"),
  ferienSaldoStand: optionalesDatum("Stand des Ferien-Saldos"),
  ahvNummer: optionalerText(20)
    .transform((w) => (w ? ahvFormatieren(w) : w))
    .refine(
      (w) => w === null || w === undefined || ahvGueltig(w),
      "AHV-Nummer stimmt nicht. Erwartet wird 756.xxxx.xxxx.xx.",
    ),
  iban: optionalerText(40)
    .transform((w) => (w ? ibanFormatieren(w) : w))
    .refine(
      (w) => w === null || w === undefined || ibanGueltig(w),
      "IBAN stimmt nicht. Bitte prüfen, ob sich eine Ziffer vertauscht hat.",
    ),

  notizen: optionalerText(2000),
};

/** Austritt darf nicht vor dem Eintritt liegen. */
function datenPassenZusammen(d: {
  eintrittsdatum?: string | null;
  austrittsdatum?: string | null;
}) {
  if (!d.eintrittsdatum || !d.austrittsdatum) return true;
  return d.austrittsdatum >= d.eintrittsdatum;
}

export const MitarbeiterAnlegenSchema = z.object(mitarbeiterFelder).refine(datenPassenZusammen, {
  message: "Der Austritt liegt vor dem Eintritt.",
  path: ["austrittsdatum"],
});
export type MitarbeiterAnlegen = z.infer<typeof MitarbeiterAnlegenSchema>;

export const MitarbeiterAendernSchema = z
  .object(mitarbeiterFelder)
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Es wurde nichts geändert.")
  .refine(datenPassenZusammen, {
    message: "Der Austritt liegt vor dem Eintritt.",
    path: ["austrittsdatum"],
  });
export type MitarbeiterAendern = z.infer<typeof MitarbeiterAendernSchema>;

/** Felder, die nur mit dem Recht "loehne:lesen" sichtbar sind. */
export const LOHNFELDER = ["stundenlohn", "monatslohn"] as const;

// --- Objekte -------------------------------------------------------------

const objektFelder = {
  name: z.string().trim().min(1, "Name fehlt.").max(120),
  objektNr: optionalerText(40),
  kunde: optionalerText(120),
  strasse: optionalerText(120),
  plz: optionalerText(10),
  ort: optionalerText(80),
  aboBetrag: optionaleDezimalzahl(10, 2, "Abo-Betrag"),
  aktiv: z.boolean().optional(),
  notizen: optionalerText(2000),
};

export const ObjektAnlegenSchema = z.object(objektFelder);
export type ObjektAnlegen = z.infer<typeof ObjektAnlegenSchema>;

export const ObjektAendernSchema = z
  .object(objektFelder)
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Es wurde nichts geändert.");
export type ObjektAendern = z.infer<typeof ObjektAendernSchema>;
