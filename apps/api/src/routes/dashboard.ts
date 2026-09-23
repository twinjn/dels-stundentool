/**
 * Startseite: keine Begruessung, sondern eine Lagemeldung.
 *
 * Was ist diesen Monat erfasst, was fehlt noch, wo geht die Zeit hin.
 *
 * WARUM HIER GERECHNET WIRD UND NICHT IM BROWSER: ein Jahr hat rund
 * 4000 Eintraege. Die alle zu schicken, damit der Browser daraus vier
 * Zahlen bildet, waere genau die Langsamkeit, die am bisherigen Excel
 * stoert. Postgres summiert das in einer Abfrage.
 */
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { hatRecht } from "@dels/shared";
import { brauchtRecht } from "../auth/guards.js";
import { db } from "../db/index.js";
import { eintraege, mitarbeiter, objekte } from "../db/schema.js";
import { ferienstand } from "../ferien/saldo.js";

export const dashboardRouter = Router();

const MonatSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Monat im Format JJJJ-MM erwartet.");

/** Heutiges Datum in Schweizer Ortszeit als "JJJJ-MM-TT". */
export function heuteInZuerich(jetzt: Date = new Date()): string {
  // en-CA formatiert als JJJJ-MM-TT, genau was wir brauchen.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(jetzt);
}

function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

/**
 * Der Zeitraum, ueber den gerechnet wird, und der vergleichbare Zeitraum
 * im Vormonat.
 *
 * DER WICHTIGE TEIL: Im laufenden Monat wird nur bis heute gerechnet und
 * im Vormonat auch nur bis zum gleichen Tag. Sonst sieht jeder
 * Monatsanfang nach einem Einbruch aus ("87 % weniger als im Vormonat"),
 * und nach drei solchen Meldungen schaut niemand mehr hin.
 */
export function zeitraeume(
  monat: string,
  heute: string,
): { von: string; bis: string; vorVon: string; vorBis: string; laufend: boolean } {
  const [jahr, nr] = monat.split("-").map(Number) as [number, number];
  const laufend = monat === heute.slice(0, 7);
  const letzterTag = tageImMonat(jahr, nr);
  const stichtag = laufend ? Number(heute.slice(8, 10)) : letzterTag;

  const vorJahr = nr === 1 ? jahr - 1 : jahr;
  const vorNr = nr === 1 ? 12 : nr - 1;
  const vorLetzter = tageImMonat(vorJahr, vorNr);
  // Nur im laufenden Monat wird der Vormonat beschnitten. Ein
  // abgeschlossener Monat wird gegen einen ganzen Monat verglichen,
  // sonst fehlte beim Vergleich Juni gegen Mai der 31. Mai.
  // Und den 31. gibt es im Februar nicht: auf den letzten Tag begrenzen.
  const vorStichtag = laufend ? Math.min(stichtag, vorLetzter) : vorLetzter;

  const p = (n: number): string => String(n).padStart(2, "0");
  return {
    von: `${monat}-01`,
    bis: `${monat}-${p(stichtag)}`,
    vorVon: `${vorJahr}-${p(vorNr)}-01`,
    vorBis: `${vorJahr}-${p(vorNr)}-${p(vorStichtag)}`,
    laufend,
  };
}

const ABSENZARTEN = ["ferien", "krankheit", "unfall", "feiertag", "sonstiges"] as const;

/** Ab diesem Monat wird an offene Ferientage erinnert. 10 = Oktober. */
const AB_MONAT_MAHNEN = 10;

dashboardRouter.get("/", brauchtRecht("stunden:lesen"), async (req, res) => {
  const heute = heuteInZuerich();
  const monat = MonatSchema.parse(req.query.monat ?? heute.slice(0, 7));
  const { von, bis, vorVon, vorBis, laufend } = zeitraeume(monat, heute);
  const jahr = monat.slice(0, 4);

  const imZeitraum = (a: string, b: string) =>
    and(gte(eintraege.datum, a), lte(eintraege.datum, b));
  const arbeit = eq(eintraege.art, "arbeit");

  const [
    stunden,
    stundenVormonat,
    absenzen,
    personenGesamt,
    personenMitErfassung,
    objekteGesamt,
    topObjekte,
    ohneErfassung,
    ferienJahr,
  ] = await Promise.all([
    db
      .select({ summe: sql<string>`coalesce(sum(${eintraege.wert}), 0)` })
      .from(eintraege)
      .where(and(arbeit, imZeitraum(von, bis))),

    db
      .select({ summe: sql<string>`coalesce(sum(${eintraege.wert}), 0)` })
      .from(eintraege)
      .where(and(arbeit, imZeitraum(vorVon, vorBis))),

    db
      .select({ art: eintraege.art, summe: sql<string>`coalesce(sum(${eintraege.wert}), 0)` })
      .from(eintraege)
      .where(and(inArray(eintraege.art, [...ABSENZARTEN]), imZeitraum(von, bis)))
      .groupBy(eintraege.art),

    db
      .select({ anzahl: sql<string>`count(*)` })
      .from(mitarbeiter)
      .where(eq(mitarbeiter.aktiv, true)),

    db
      .select({ anzahl: sql<string>`count(distinct ${eintraege.mitarbeiterId})` })
      .from(eintraege)
      .where(and(arbeit, imZeitraum(von, bis))),

    db
      .select({ anzahl: sql<string>`count(*)` })
      .from(objekte)
      .where(eq(objekte.aktiv, true)),

    db
      .select({
        id: objekte.id,
        objektNr: objekte.objektNr,
        name: objekte.name,
        stunden: sql<string>`sum(${eintraege.wert})`,
      })
      .from(eintraege)
      .innerJoin(objekte, eq(eintraege.objektId, objekte.id))
      .where(and(arbeit, imZeitraum(von, bis)))
      .groupBy(objekte.id, objekte.objektNr, objekte.name)
      .orderBy(sql`sum(${eintraege.wert}) desc`),

    // Aktive Leute, von denen in diesem Zeitraum keine Arbeitsstunde
    // erfasst ist. Das ist die haeufigste offene Aufgabe im Monat.
    db
      .select({ id: mitarbeiter.id, name: mitarbeiter.name })
      .from(mitarbeiter)
      .where(
        and(
          eq(mitarbeiter.aktiv, true),
          sql`not exists (
            select 1 from ${eintraege}
            where ${eintraege.mitarbeiterId} = ${mitarbeiter.id}
              and ${eintraege.art} = 'arbeit'
              and ${eintraege.datum} between ${von} and ${bis}
          )`,
        ),
      )
      .orderBy(asc(sql`${mitarbeiter.name} collate "de-CH-x-icu"`)),

    /*
     * Ferientage des laufenden Jahres, gegen den Jahresanspruch.
     *
     * ALS VERBUND GESCHRIEBEN, NICHT ALS UNTERABFRAGE, und das ist kein
     * Geschmack. Drizzle setzt Tabellenpraefixe nur in Bedingungen, die
     * es selbst baut (eq, and, gte). In einem rohen sql-Baustein in der
     * SELECT-Liste bleiben die Spalten unqualifiziert: aus
     *   where ${eintraege.mitarbeiterId} = ${mitarbeiter.id}
     * wurde
     *   where "mitarbeiter_id" = "id"
     * und innerhalb der Unterabfrage ist "id" die ID des EINTRAGS, nicht
     * die der Person. Die Bedingung war damit nie wahr, jede Person kam
     * auf null bezogene Ferientage, und die Seite haette auf immer
     * gemeldet, dass alles in Ordnung ist. Kein Fehler, keine Warnung,
     * nur eine falsche Zahl. Mit eq() und leftJoin() kann das nicht
     * passieren, weil Drizzle dort selbst qualifiziert.
     */
    db
      .select({
        id: mitarbeiter.id,
        name: mitarbeiter.name,
        anspruch: mitarbeiter.ferienanspruch,
        bezogen: sql<string>`coalesce(sum(${eintraege.wert}), 0)`,
      })
      .from(mitarbeiter)
      .leftJoin(
        eintraege,
        and(
          eq(eintraege.mitarbeiterId, mitarbeiter.id),
          eq(eintraege.art, "ferien"),
          gte(eintraege.datum, `${jahr}-01-01`),
          lte(eintraege.datum, `${jahr}-12-31`),
        ),
      )
      .where(eq(mitarbeiter.aktiv, true))
      .groupBy(mitarbeiter.id, mitarbeiter.name, mitarbeiter.ferienanspruch),
  ]);

  const zahl = (wert: string | undefined): number => Number(wert ?? 0);

  const absenzJeArt: Record<string, number> = {};
  for (const art of ABSENZARTEN) absenzJeArt[art] = 0;
  for (const zeile of absenzen) absenzJeArt[zeile.art] = zahl(zeile.summe);

  const ueberAnspruch = ferienJahr
    .filter((p) => zahl(p.bezogen) > zahl(p.anspruch))
    .map((p) => ({
      id: p.id,
      name: p.name,
      anspruch: zahl(p.anspruch),
      bezogen: zahl(p.bezogen),
    }))
    .sort((a, b) => b.bezogen - a.bezogen - (a.anspruch - b.anspruch));

  // Wer keinen Stundenlohn hinterlegt hat, zaehlt in der Kalkulation mit
  // 0 Franken Lohnkosten mit und verfaelscht damit jeden
  // Deckungsbeitrag. Die Liste sieht nur, wer Loehne sehen darf: sie
  // nennt zwar keinen Betrag, gehoert aber trotzdem zum Lohnbereich.
  const darfLoehne = hatRecht(req.benutzer!.rolle, "loehne:lesen");
  const ohneStundenlohn = darfLoehne
    ? await db
        .select({ id: mitarbeiter.id, name: mitarbeiter.name })
        .from(mitarbeiter)
        .where(
          and(
            eq(mitarbeiter.aktiv, true),
            // Frueher stand hier ein Vergleich gegen den Freitext
            // "Monatslohn" aus dem Excel. Seit es die Spalte lohnart
            // gibt, fragt man die, und ein Tippfehler im Freitext kann
            // die Liste nicht mehr verfaelschen.
            eq(mitarbeiter.lohnart, "stunde"),
            or(isNull(mitarbeiter.stundenlohn), eq(mitarbeiter.stundenlohn, "0.00")),
          ),
        )
        .orderBy(asc(sql`${mitarbeiter.name} collate "de-CH-x-icu"`))
    : null;

  /*
   * Ab Oktober: wer hat noch Ferientage offen.
   *
   * Drei Monate Vorlauf, damit die Leute ihre Tage noch planen koennen.
   * Vorher waere es nur Rauschen: im Maerz hat naturgemaess fast jeder
   * fast alles offen, und eine Warnung, die immer leuchtet, schaut nach
   * zwei Wochen niemand mehr an.
   *
   * Nur Monatsloehner. Bei Stundenlohn sind die Ferien mit jedem Lohn
   * schon ausbezahlt, da gibt es nichts zu mahnen.
   */
  const monatNr = Number(monat.slice(5, 7));
  const ferienOffen =
    monatNr >= AB_MONAT_MAHNEN
      ? (await ferienstand(Number(monat.slice(0, 4))))
          .filter((z): z is Extract<typeof z, { art: "monat" }> => z.art === "monat")
          .filter((z) => z.rest > 0)
          .map((z) => ({
            id: z.id,
            name: z.name,
            rest: z.rest,
            unsicher: z.verlaufUnvollstaendig,
          }))
          .sort((a, b) => b.rest - a.rest)
      : null;

  res.json({
    monat,
    heute,
    laufend,
    bis,
    stunden: {
      zeitraum: zahl(stunden[0]?.summe),
      vormonat: zahl(stundenVormonat[0]?.summe),
    },
    absenzen: absenzJeArt,
    mitarbeiter: {
      gesamt: zahl(personenGesamt[0]?.anzahl),
      mitErfassung: zahl(personenMitErfassung[0]?.anzahl),
    },
    objekte: {
      gesamt: zahl(objekteGesamt[0]?.anzahl),
      bebucht: topObjekte.length,
    },
    topObjekte: topObjekte.slice(0, 6).map((o) => ({
      id: o.id,
      objektNr: o.objektNr,
      name: o.name,
      stunden: zahl(o.stunden),
    })),
    offen: {
      ohneErfassung: ohneErfassung.slice(0, 40),
      ohneErfassungAnzahl: ohneErfassung.length,
      ueberFerienanspruch: ueberAnspruch,
      ferienOffen,
      ohneStundenlohn,
    },
  });
});
