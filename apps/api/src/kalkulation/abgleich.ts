/**
 * Abgleich zwischen Stammdaten und einem Kalkulationsmonat.
 *
 * WARUM ES DEN ABGLEICH BRAUCHT, und warum nicht einfach automatisch
 * synchronisiert wird:
 *
 * Ein Kalkulationsmonat ist eine Aufzeichnung, kein Live-Bericht.
 * Stunden und Stundenlöhne liest die Rechnung bei jedem Öffnen frisch,
 * die sind immer aktuell. Der Abo-Betrag dagegen steht fest im Monat.
 * Würde er live aus den Stammdaten kommen, schriebe jede Preiserhöhung
 * still sämtliche Vergangenheit um, und die Zahlen, die letzten Monat
 * beim Treuhänder auf dem Tisch lagen, liessen sich nicht mehr
 * herstellen.
 *
 * Gleichzeitig darf eine Abweichung nicht unsichtbar bleiben. Ein
 * Objekt, das nach dem Anlegen des Monats dazukam, fehlt in der
 * Rechnung vollständig, und niemand merkt es: es taucht auch in keiner
 * Warnung auf, weil es schlicht nicht da ist.
 *
 * Deshalb dieser Weg: unterschiede() zeigt, was auseinanderläuft,
 * uebernehmen() räumt es auf Knopfdruck auf, und beides landet im
 * Protokoll. Nichts passiert von selbst.
 */
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  eintraege,
  kalkMonat,
  kalkObjektMonat,
  kalkPersonMonat,
  mitarbeiter,
  objekte,
  objektAbo,
} from "../db/schema.js";

export type Unterschied =
  | {
      art: "objekt_fehlt";
      objektId: string;
      objektNr: string | null;
      name: string;
      /** Preis, der am Ersten des Monats gilt. */
      abo: string | null;
      /** Stunden, die in diesem Monat schon auf das Objekt gebucht sind. */
      stunden: number;
    }
  | {
      art: "abo_weicht_ab";
      objektId: string;
      objektNr: string | null;
      name: string;
      imMonat: string | null;
      lautStammdaten: string | null;
    }
  | {
      art: "objekt_stillgelegt";
      objektId: string;
      objektNr: string | null;
      name: string;
    }
  | {
      /**
       * Ein Monatslöhner ohne Zeile im Monat.
       *
       * Das ist der teuerste Fall überhaupt: sein ganzer Lohn fehlt in
       * der Rechnung, und zwar ohne jede Spur. Stundenlöhner stehen
       * hier bewusst NICHT, ihre Kosten laufen über die Objektzeilen.
       */
      art: "monatslohn_fehlt";
      mitarbeiterId: string;
      personalnummer: string | null;
      name: string;
      lautStammdaten: string | null;
    }
  | {
      art: "lohn_weicht_ab";
      mitarbeiterId: string;
      personalnummer: string | null;
      name: string;
      imMonat: string | null;
      lautStammdaten: string | null;
    }
  | {
      /**
       * Wird doppelt gezählt: steht in der Personalliste UND hat
       * Stunden auf Objekten. Der Lohn läuft dann über beide Wege in
       * die Rechnung.
       *
       * Ohne Knopf, weil die Antwort nicht in den Daten steht: je
       * nachdem ist die Personalzeile falsch (Stundenlöhner, der
       * versehentlich drinsteht) oder die Erfassung (Monatslöhner, der
       * seine Zeit trotzdem auf Objekte bucht). Das muss ein Mensch
       * entscheiden.
       */
      art: "person_doppelt";
      mitarbeiterId: string;
      personalnummer: string | null;
      name: string;
      lohnart: "monat" | "stunde";
      imMonat: string | null;
      stunden: number;
    };

/** Punkte, die sich auf Knopfdruck beheben lassen. Der Rest ist Hinweis. */
export function behebbar(u: Unterschied): boolean {
  return u.art !== "person_doppelt";
}

export type Abgleichsbericht = {
  monat: string;
  abgeschlossen: boolean;
  unterschiede: Unterschied[];
};

const zahl = (w: string | null | undefined): number => Number(w ?? 0);

/**
 * Der Abo-Preis, der an einem Stichtag gilt: der jüngste Eintrag, dessen
 * gueltigAb nicht in der Zukunft liegt.
 *
 * Über DISTINCT ON statt über eine Unterabfrage im SELECT. Drizzle setzt
 * Tabellenpräfixe nur in Bedingungen, die es selbst baut; in einem rohen
 * sql-Baustein in der SELECT-Liste bleiben Spalten unqualifiziert, und
 * das hat in diesem Projekt schon einmal eine still falsche Zahl
 * erzeugt (siehe den Kommentar in routes/dashboard.ts).
 */
export async function preiseAm(stichtag: string): Promise<Map<string, string>> {
  const zeilen = await db
    .selectDistinctOn([objektAbo.objektId], {
      objektId: objektAbo.objektId,
      betrag: objektAbo.betrag,
    })
    .from(objektAbo)
    .where(lte(objektAbo.gueltigAb, stichtag))
    .orderBy(objektAbo.objektId, sql`${objektAbo.gueltigAb} desc`);

  return new Map(zeilen.map((z) => [z.objektId, z.betrag]));
}

/** Was läuft zwischen Stammdaten und diesem Monat auseinander? */
export async function unterschiede(monat: string): Promise<Abgleichsbericht> {
  const [kopf] = await db.select().from(kalkMonat).where(eq(kalkMonat.monat, monat));
  if (!kopf) throw new Error(`${monat} ist nicht angelegt.`);

  const bis = monatsende(monat);

  const [alleObjekte, imMonat, preise, stundenObjekt, personenImMonat, stundenPerson] =
    await Promise.all([
      db.select().from(objekte),
      db.select().from(kalkObjektMonat).where(eq(kalkObjektMonat.monat, monat)),
      preiseAm(monat),
      db
        .select({
          objektId: eintraege.objektId,
          summe: sql<string>`coalesce(sum(${eintraege.wert}), 0)`,
        })
        .from(eintraege)
        .where(
          and(eq(eintraege.art, "arbeit"), gte(eintraege.datum, monat), lte(eintraege.datum, bis)),
        )
        .groupBy(eintraege.objektId),
      db.select().from(kalkPersonMonat).where(eq(kalkPersonMonat.monat, monat)),
      db
        .select({
          mitarbeiterId: eintraege.mitarbeiterId,
          summe: sql<string>`coalesce(sum(${eintraege.wert}), 0)`,
        })
        .from(eintraege)
        .where(
          and(eq(eintraege.art, "arbeit"), gte(eintraege.datum, monat), lte(eintraege.datum, bis)),
        )
        .groupBy(eintraege.mitarbeiterId),
    ]);

  const zeileJeObjekt = new Map(imMonat.map((z) => [z.objektId, z]));
  const stundenJeObjekt = new Map(stundenObjekt.map((z) => [z.objektId ?? "", zahl(z.summe)]));
  const gefunden: Unterschied[] = [];

  for (const o of alleObjekte) {
    const zeile = zeileJeObjekt.get(o.id);
    const preis = preise.get(o.id) ?? o.aboBetrag;

    if (!zeile) {
      // Ein stillgelegtes Objekt ohne Stunden fehlt zu Recht.
      if (!o.aktiv && !stundenJeObjekt.get(o.id)) continue;
      gefunden.push({
        art: "objekt_fehlt",
        objektId: o.id,
        objektNr: o.objektNr,
        name: o.name,
        abo: preis,
        stunden: stundenJeObjekt.get(o.id) ?? 0,
      });
      continue;
    }

    if (!o.aktiv && zeile.aktiv) {
      gefunden.push({
        art: "objekt_stillgelegt",
        objektId: o.id,
        objektNr: o.objektNr,
        name: o.name,
      });
    }

    if (o.aktiv && zahl(zeile.aboBetrag) !== zahl(preis)) {
      gefunden.push({
        art: "abo_weicht_ab",
        objektId: o.id,
        objektNr: o.objektNr,
        name: o.name,
        imMonat: zeile.aboBetrag,
        lautStammdaten: preis,
      });
    }
  }

  /*
   * Personal.
   *
   * ENTSCHEIDEND IST DIE LOHNART, NICHT DIE STUNDENZAHL.
   *
   * Die Rechnung hat zwei getrennte Kostenwege, und jeder Mensch
   * gehört in genau einen davon:
   *
   *   Stundenlöhner  Stunden x Stundenlohn, über die Objektzeilen
   *                  (lohnSzObj). Sie haben KEINE Zeile in der
   *                  Personalliste und sollen auch keine bekommen.
   *
   *   Monatslöhner   fester Betrag in kalk_person_monat (lohnSzPers).
   *                  Ohne Zeile fehlt ihr ganzer Lohn.
   *
   * Beide Summen werden am Ende vom Umsatz abgezogen. Wer in beiden
   * steht, wird doppelt belastet.
   */
  const zeileJePerson = new Map(personenImMonat.map((p) => [p.mitarbeiterId, p]));
  const stundenJePerson = new Map(stundenPerson.map((s) => [s.mitarbeiterId, zahl(s.summe)]));
  const leute = await db.select().from(mitarbeiter);

  for (const m of leute) {
    const zeile = zeileJePerson.get(m.id);
    const stunden = stundenJePerson.get(m.id) ?? 0;

    if (zeile && stunden > 0) {
      gefunden.push({
        art: "person_doppelt",
        mitarbeiterId: m.id,
        personalnummer: m.personalnummer,
        name: m.name,
        lohnart: m.lohnart,
        imMonat: zeile.lohn,
        stunden,
      });
    }

    if (m.lohnart !== "monat") continue;

    if (!zeile) {
      // Ein stillgelegter Monatslöhner ohne Zeile fehlt zu Recht.
      if (!m.aktiv) continue;
      gefunden.push({
        art: "monatslohn_fehlt",
        mitarbeiterId: m.id,
        personalnummer: m.personalnummer,
        name: m.name,
        lautStammdaten: m.monatslohn,
      });
      continue;
    }

    if (m.aktiv && zahl(zeile.lohn) !== zahl(m.monatslohn)) {
      gefunden.push({
        art: "lohn_weicht_ab",
        mitarbeiterId: m.id,
        personalnummer: m.personalnummer,
        name: m.name,
        imMonat: zeile.lohn,
        lautStammdaten: m.monatslohn,
      });
    }
  }

  gefunden.sort(
    (a, b) => ART_REIHE[a.art] - ART_REIHE[b.art] || a.name.localeCompare(b.name, "de-CH"),
  );

  return { monat, abgeschlossen: kopf.abgeschlossenAm !== null, unterschiede: gefunden };
}

/**
 * Reihenfolge nach Schadenshöhe.
 *
 * Ganz fehlende Kosten stehen oben: ein Monatslohn, der in der Rechnung
 * gar nicht vorkommt, verschiebt das Ergebnis um Tausende. Ein Abo, das
 * um fünfzig Franken abweicht, steht weiter unten.
 */
const ART_REIHE: Record<Unterschied["art"], number> = {
  person_doppelt: 0,
  monatslohn_fehlt: 1,
  objekt_fehlt: 2,
  lohn_weicht_ab: 3,
  abo_weicht_ab: 4,
  objekt_stillgelegt: 5,
};

/**
 * Stabiler Schlüssel für einen Punkt.
 *
 * Der Browser schickt nur diese Schlüssel zurück, nie Beträge. Beim
 * Übernehmen wird der Bericht neu gerechnet und nur die Auswahl daraus
 * gefiltert, damit immer der Wert landet, der jetzt gilt, und nicht
 * der, den ein altes Bild noch zeigte.
 */
export function schluesselVon(u: Unterschied): string {
  return "mitarbeiterId" in u ? `${u.art}:${u.mitarbeiterId}` : `${u.art}:${u.objektId}`;
}

/** Letzter Tag des Monats als "JJJJ-MM-TT". */
export function monatsende(monat: string): string {
  const [j, m] = monat.slice(0, 7).split("-").map(Number) as [number, number];
  const tage = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return `${monat.slice(0, 7)}-${String(tage).padStart(2, "0")}`;
}

/** Wendet die gewählten Unterschiede an. Gibt zurück, was getan wurde. */
export async function uebernehmen(
  monat: string,
  auswahl: Unterschied[],
): Promise<{ angelegt: number; angepasst: number; stillgelegt: number; personen: number }> {
  const bilanz = { angelegt: 0, angepasst: 0, stillgelegt: 0, personen: 0 };

  await db.transaction(async (tx) => {
    for (const u of auswahl) {
      if (u.art === "objekt_fehlt") {
        await tx
          .insert(kalkObjektMonat)
          .values({ monat, objektId: u.objektId, aboBetrag: u.abo, aktiv: true })
          .onConflictDoNothing();
        bilanz.angelegt += 1;
      } else if (u.art === "abo_weicht_ab") {
        await tx
          .update(kalkObjektMonat)
          .set({ aboBetrag: u.lautStammdaten })
          .where(and(eq(kalkObjektMonat.monat, monat), eq(kalkObjektMonat.objektId, u.objektId)));
        bilanz.angepasst += 1;
      } else if (u.art === "objekt_stillgelegt") {
        await tx
          .update(kalkObjektMonat)
          .set({ aktiv: false })
          .where(and(eq(kalkObjektMonat.monat, monat), eq(kalkObjektMonat.objektId, u.objektId)));
        bilanz.stillgelegt += 1;
      } else if (u.art === "monatslohn_fehlt") {
        await tx
          .insert(kalkPersonMonat)
          .values({ monat, mitarbeiterId: u.mitarbeiterId, lohn: u.lautStammdaten ?? "0" })
          .onConflictDoNothing();
        bilanz.personen += 1;
      } else if (u.art === "lohn_weicht_ab") {
        await tx
          .update(kalkPersonMonat)
          .set({ lohn: u.lautStammdaten ?? "0" })
          .where(
            and(
              eq(kalkPersonMonat.monat, monat),
              eq(kalkPersonMonat.mitarbeiterId, u.mitarbeiterId),
            ),
          );
        bilanz.angepasst += 1;
      } else {
        // person_doppelt: braucht eine menschliche Entscheidung, siehe
        // den Kommentar am Typ. Kommt über behebbar() gar nicht hierher.
        throw new Error(`${u.art} laesst sich nicht automatisch beheben.`);
      }
    }
  });

  return bilanz;
}
