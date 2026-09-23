/**
 * Liest die bestehenden Excel-Stundenkontrollen ein.
 *
 *   npm run db:import-excel -- --ordner "C:\\Pfad\\zu\\2026"
 *   npm run db:import-excel -- --datei  "C:\\Pfad\\zu\\10019_2026.xlsm"
 *
 * Standardmässig ein TROCKENLAUF: es wird gelesen, gerechnet, verglichen
 * und berichtet, aber nichts geschrieben. Erst mit --schreiben landet
 * etwas in der Datenbank.
 *
 * Das Kommando läuft auf dem Rechner, auf dem die Dateien liegen. Sie
 * müssen nirgendwohin hochgeladen werden.
 *
 * Optionen:
 *   --schreiben           wirklich in die Datenbank schreiben
 *   --ersetzen            vorhandene Einträge der betroffenen Monate
 *                         vorher löschen (sonst bricht es ab)
 *   --fehlende-anlegen    Mitarbeiter und Objekte anlegen, die es in der
 *                         Datenbank noch nicht gibt
 *   --stammdaten          zusätzlich das Blatt "Personal" übernehmen
 *                         (Funktion, Einsatzort, Adresse, Ferien-Saldo)
 *   --jahr 2026           Jahr vorgeben, falls es in der Datei fehlt
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import XLSX from "xlsx";
import { datenbankSchliessen, db } from "../db/index.js";
import { eintraege as eintraegeTabelle, mitarbeiter, objekte } from "../db/schema.js";
import { protokolliere } from "../protokoll.js";
import { MONATSNAMEN, leseVerwaltungsblatt, summenNachrechnen } from "./excel.js";
import type { ExcelEintrag, ExcelSummen } from "./excel.js";
import { leseObjektblatt, zusammenfuehren } from "./excelObjekt.js";
import { erkenneDatei, standAusDatei } from "./dateiInfo.js";
import { lesePersonalblatt } from "./personal.js";
import type { PersonalZeile } from "./personal.js";

XLSX.set_fs(fs);

// --- Argumente -----------------------------------------------------------

function argument(name: string): string | undefined {
  const stelle = process.argv.indexOf(`--${name}`);
  if (stelle < 0) return undefined;
  const wert = process.argv[stelle + 1];
  return wert && !wert.startsWith("--") ? wert : undefined;
}

const schalter = (name: string) => process.argv.includes(`--${name}`);

const ordner = argument("ordner");
const einzeldatei = argument("datei");
const jahrVorgabe = Number(argument("jahr")) || null;
const schreiben = schalter("schreiben");
const ersetzen = schalter("ersetzen");
const fehlendeAnlegen = schalter("fehlende-anlegen");
const stammdaten = schalter("stammdaten");

if (!ordner && !einzeldatei) {
  console.error(`
Kein Ordner und keine Datei angegeben.

  npm run db:import-excel -- --ordner "/Pfad/zu/2026"
  npm run db:import-excel -- --datei  "/Pfad/zur/Datei.xlsm"

Ohne --schreiben passiert nichts, es wird nur berichtet.
`);
  process.exit(1);
}

function dateienSammeln(): string[] {
  if (einzeldatei) return [einzeldatei];
  const eintraege = fs.readdirSync(ordner!, { withFileTypes: true });
  return eintraege
    .filter((e) => e.isFile() && /\.xlsm?$|\.xlsx$/i.test(e.name) && !e.name.startsWith("~$"))
    .map((e) => path.join(ordner!, e.name))
    .sort();
}

// --- Lesen ---------------------------------------------------------------

type Gelesen = {
  datei: string;
  typ: string;
  jahr: number;
  eintraege: ExcelEintrag[];
  summenLautExcel: ExcelSummen[];
  warnungen: string[];
  personal: PersonalZeile[];
  stand: string | null;
};

function dateiLesen(pfad: string): Gelesen | null {
  const name = path.basename(pfad);
  let mappe: XLSX.WorkBook;

  try {
    mappe = XLSX.readFile(pfad);
  } catch (fehler) {
    console.log(`  ${name}: liess sich nicht öffnen (${(fehler as Error).message})`);
    return null;
  }

  const info = erkenneDatei(mappe, name);
  const jahr = jahrVorgabe ?? info.jahr;

  if (info.typ === "unbekannt" || jahr === null) {
    console.log(`  ${name}: übersprungen (${info.grund ?? "Jahr unbekannt"})`);
    return null;
  }

  const eintraege: ExcelEintrag[] = [];
  const summen: ExcelSummen[] = [];
  const warnungen: string[] = [];

  for (const monat of MONATSNAMEN) {
    const ergebnis =
      info.typ === "verwaltung"
        ? leseVerwaltungsblatt(mappe, monat, jahr)
        : leseObjektblatt(mappe, monat, jahr, info.objektNr ?? undefined);

    eintraege.push(...ergebnis.eintraege);
    summen.push(...ergebnis.summenLautExcel);
    warnungen.push(...ergebnis.warnungen);
  }

  const personal = mappe.Sheets["Personal"] ? lesePersonalblatt(mappe) : null;
  if (personal) warnungen.push(...personal.warnungen);

  return {
    datei: name,
    typ: info.typ,
    jahr,
    eintraege,
    summenLautExcel: summen,
    warnungen,
    personal: personal?.zeilen ?? [],
    stand: standAusDatei(mappe),
  };
}

// --- Ablauf --------------------------------------------------------------

const dateien = dateienSammeln();
console.log(`\n${dateien.length} Datei(en) gefunden.\n`);

const gelesen: Gelesen[] = [];
for (const pfad of dateien) {
  const ergebnis = dateiLesen(pfad);
  if (!ergebnis) continue;
  gelesen.push(ergebnis);
  console.log(
    `  ${ergebnis.datei.padEnd(42)} ${ergebnis.typ.padEnd(11)} ${ergebnis.jahr}  ${String(ergebnis.eintraege.length).padStart(5)} Eintraege${ergebnis.warnungen.length ? `  (${ergebnis.warnungen.length} Hinweise)` : ""}`,
  );
}

if (gelesen.length === 0) {
  console.error("\nNichts Brauchbares gefunden.\n");
  await datenbankSchliessen();
  process.exit(1);
}

const { eintraege: alleEintraege, warnungen: zusammenfuehrWarnungen } = zusammenfuehren(
  gelesen.map((g) => g.eintraege),
);

const alleWarnungen = [...gelesen.flatMap((g) => g.warnungen), ...zusammenfuehrWarnungen];

console.log(`\nNach dem Zusammenführen: ${alleEintraege.length} Einträge.`);
if (alleEintraege.length !== gelesen.reduce((s, g) => s + g.eintraege.length, 0)) {
  const weg = gelesen.reduce((s, g) => s + g.eintraege.length, 0) - alleEintraege.length;
  console.log(`  ${weg} doppelte Abwesenheiten zusammengefasst (dieselbe Person, derselbe Tag).`);
}

// --- Abgleich mit den Summen aus Excel -----------------------------------

const nachgerechnet = summenNachrechnen(alleEintraege);
const abweichungen: string[] = [];

/**
 * Summen aus Excel zusammenfassen, je Person UND Monat.
 *
 * Zwei verschiedene Regeln, und die Unterscheidung ist der ganze Punkt:
 *  - über MONATE wird addiert (Januar plus Februar plus ...)
 *  - über DATEIEN zum selben Monat gilt bei Abwesenheiten das Maximum,
 *    denn dieselben Ferientage stehen in jeder Objektdatei der Person.
 *    Gearbeitete Stunden dagegen addieren sich, die gehören zu
 *    verschiedenen Objekten.
 */
const excelSummen = new Map<string, ExcelSummen>();
for (const g of gelesen) {
  for (const s of g.summenLautExcel) {
    const schluessel = `${s.personalnummer}|${s.monat}`;
    const bisher = excelSummen.get(schluessel);
    if (!bisher) {
      excelSummen.set(schluessel, { ...s });
      continue;
    }
    bisher.arbeit += s.arbeit;
    bisher.ferien = Math.max(bisher.ferien, s.ferien);
    bisher.krank = Math.max(bisher.krank, s.krank);
    bisher.unfall = Math.max(bisher.unfall, s.unfall);
    bisher.sonst = Math.max(bisher.sonst, s.sonst);
  }
}

for (const [schluessel, laut] of excelSummen) {
  const meins = nachgerechnet.get(schluessel);
  for (const [was, excelWert, eigenWert] of [
    ["Arbeit", laut.arbeit, meins?.arbeit ?? 0],
    ["Ferien", laut.ferien, meins?.ferien ?? 0],
    ["Krank", laut.krank, meins?.krank ?? 0],
    ["Unfall", laut.unfall, meins?.unfall ?? 0],
  ] as [string, number, number][]) {
    if (Math.abs(excelWert - eigenWert) > 0.005) {
      abweichungen.push(
        `  ${laut.monat} PerNr ${laut.personalnummer} (${laut.name}) ${was}: Excel=${excelWert} gelesen=${eigenWert.toFixed(2)}`,
      );
    }
  }
}

console.log(
  `\nAbgleich mit den Summen, die Excel selbst anzeigt: ${abweichungen.length === 0 ? "keine Abweichung." : `${abweichungen.length} Abweichung(en).`}`,
);
for (const a of abweichungen.slice(0, 20)) console.log(a);
if (abweichungen.length > 20) console.log(`  ... und ${abweichungen.length - 20} weitere.`);

if (alleWarnungen.length > 0) {
  console.log(`\n${alleWarnungen.length} Hinweis(e) beim Lesen:`);
  for (const w of alleWarnungen.slice(0, 20)) console.log(`  ${w}`);
  if (alleWarnungen.length > 20) console.log(`  ... und ${alleWarnungen.length - 20} weitere.`);
}

// --- Abgleich mit den Stammdaten -----------------------------------------

const personenListe = await db
  .select({ id: mitarbeiter.id, nr: mitarbeiter.personalnummer })
  .from(mitarbeiter);
const objekteListe = await db.select({ id: objekte.id, nr: objekte.objektNr }).from(objekte);

const personNachNr = new Map(personenListe.filter((p) => p.nr).map((p) => [p.nr!, p.id]));
const objektNachNr = new Map(objekteListe.filter((o) => o.nr).map((o) => [o.nr!, o.id]));

/** Personalnummer -> Name, aus allen gelesenen Summenzeilen. */
const namenNachNr = new Map<string, string>();
for (const s of excelSummen.values()) {
  if (s.name && !namenNachNr.has(s.personalnummer)) namenNachNr.set(s.personalnummer, s.name);
}

const fehlendePersonen = new Map<string, string>();
const fehlendeObjekte = new Set<string>();

for (const e of alleEintraege) {
  if (!personNachNr.has(e.personalnummer)) {
    const name = namenNachNr.get(e.personalnummer) ?? `Unbekannt ${e.personalnummer}`;
    fehlendePersonen.set(e.personalnummer, name);
  }
  if (e.objektNr && !objektNachNr.has(e.objektNr)) fehlendeObjekte.add(e.objektNr);
}

console.log(
  `\nStammdaten: ${fehlendePersonen.size} unbekannte Personalnummer(n), ${fehlendeObjekte.size} unbekannte Objektnummer(n).`,
);
if (fehlendePersonen.size > 0 && !fehlendeAnlegen) {
  for (const [nr, name] of [...fehlendePersonen].slice(0, 10))
    console.log(`  PerNr ${nr}: ${name}`);
  if (fehlendePersonen.size > 10) console.log(`  ... und ${fehlendePersonen.size - 10} weitere.`);
}

// --- Trockenlauf endet hier ----------------------------------------------

/**
 * Personalstamm aus allen Dateien, je Personalnummer einmal.
 * Alle Objektdateien tragen dasselbe Blatt, also genügt das erste.
 */
const personalstamm = new Map<string, PersonalZeile>();
let stichtag: string | null = null;
for (const g of gelesen) {
  if (g.stand && !stichtag) stichtag = g.stand;
  for (const zeile of g.personal) {
    if (!personalstamm.has(zeile.personalnummer)) personalstamm.set(zeile.personalnummer, zeile);
  }
}

if (personalstamm.size > 0) {
  const aktive = [...personalstamm.values()].filter((z) => z.aktiv).length;
  console.log(
    `\nPersonalstamm im Blatt "Personal": ${personalstamm.size} Personen (${aktive} aktiv), Stand ${stichtag ?? "unbekannt"}.`,
  );
  if (!stammdaten) {
    console.log("  Wird nicht übernommen. Dafür --stammdaten dazusetzen.");
  }
}

const monate = [...new Set(alleEintraege.map((e) => e.datum.slice(0, 7)))].sort();
console.log(`\nBetroffene Monate: ${monate.join(", ") || "keine"}`);

if (!schreiben) {
  console.log(
    "\nTROCKENLAUF. Es wurde nichts geschrieben." +
      "\nWenn der Bericht oben passt, nochmal mit --schreiben aufrufen.\n",
  );
  await datenbankSchliessen();
  process.exit(0);
}

// --- Schreiben -----------------------------------------------------------

const sollStammdaten = stammdaten && personalstamm.size > 0;

if (monate.length === 0 && !sollStammdaten) {
  console.log("\nNichts zu schreiben.\n");
  await datenbankSchliessen();
  process.exit(0);
}

// Zeitraum nur bestimmen, wenn überhaupt Stunden vorliegen. Eine Datei
// ohne erfasste Stunden kann trotzdem einen Personalstamm mitbringen.
const vonDatum = monate.length > 0 ? `${monate[0]}-01` : null;
const bisDatum =
  monate.length > 0
    ? (() => {
        const [j, m] = monate[monate.length - 1]!.split("-").map(Number);
        const naechster = m === 12 ? `${j! + 1}-01` : `${j}-${String(m! + 1).padStart(2, "0")}`;
        return `${naechster}-01`;
      })()
    : null;

const [vorhanden] =
  vonDatum && bisDatum
    ? await db
        .select({ anzahl: sql<number>`count(*)::int` })
        .from(eintraegeTabelle)
        .where(and(gte(eintraegeTabelle.datum, vonDatum), lt(eintraegeTabelle.datum, bisDatum)))
    : [{ anzahl: 0 }];

if ((vorhanden?.anzahl ?? 0) > 0 && !ersetzen) {
  console.error(
    `\nIn diesem Zeitraum stehen bereits ${vorhanden?.anzahl} Eintraege in der Datenbank.` +
      "\nEntweder die Monate einschraenken oder mit --ersetzen aufrufen." +
      "\n--ersetzen löscht die vorhandenen Einträge dieser Monate zuerst.\n",
  );
  await datenbankSchliessen();
  process.exit(1);
}

try {
  await db.transaction(async (tx) => {
    /**
     * Personalstamm uebernehmen.
     *
     * Regel: Excel gewinnt dort, wo es einen Wert hat. Leere Felder
     * lassen die Datenbank unangetastet. Sonst würde ein Import alles
     * überschreiben, was jemand in der Anwendung nachgetragen hat, nur
     * weil die Spalte im Excel leer ist.
     *
     * Name und Status gelten dagegen immer: das sind die Angaben, die im
     * Excel gepflegt werden.
     */
    if (stammdaten && personalstamm.size > 0) {
      let neuAngelegt = 0;
      let aktualisiert = 0;

      for (const zeile of personalstamm.values()) {
        const nurGefuellte = Object.fromEntries(
          Object.entries({
            gruppe: zeile.gruppe,
            anrede: zeile.anrede,
            funktion: zeile.funktion,
            einsatzort: zeile.einsatzort,
            notizen: zeile.notizen,
            austrittsdatum: zeile.austrittsdatum,
            ferienanspruch: zeile.ferienanspruch,
            ferienSaldo: zeile.ferienSaldo,
            ferienSaldoStand: zeile.ferienSaldo !== null ? stichtag : null,
            plz: zeile.plz,
            ort: zeile.ort,
            strasse: zeile.strasse,
            email: zeile.email,
            telefon: zeile.telefon,
            mobil: zeile.mobil,
            geburtsdatum: zeile.geburtsdatum,
            nationalitaet: zeile.nationalitaet,
          }).filter(([, wert]) => wert !== null && wert !== undefined),
        );

        const vorhandeneId = personNachNr.get(zeile.personalnummer);

        if (vorhandeneId) {
          await tx
            .update(mitarbeiter)
            .set({ name: zeile.name, aktiv: zeile.aktiv, ...nurGefuellte })
            .where(eq(mitarbeiter.id, vorhandeneId));
          aktualisiert++;
        } else {
          const [angelegt] = await tx
            .insert(mitarbeiter)
            .values({
              name: zeile.name,
              personalnummer: zeile.personalnummer,
              aktiv: zeile.aktiv,
              ...nurGefuellte,
            })
            .returning({ id: mitarbeiter.id });
          personNachNr.set(zeile.personalnummer, angelegt!.id);
          fehlendePersonen.delete(zeile.personalnummer);
          neuAngelegt++;
        }
      }

      console.log(`\nPersonalstamm: ${neuAngelegt} neu angelegt, ${aktualisiert} aktualisiert.`);
    }

    if (fehlendeAnlegen && (fehlendePersonen.size > 0 || fehlendeObjekte.size > 0)) {
      for (const [nr, name] of fehlendePersonen) {
        const [neu] = await tx
          .insert(mitarbeiter)
          .values({ name, personalnummer: nr })
          .returning({ id: mitarbeiter.id });
        personNachNr.set(nr, neu!.id);
      }
      for (const nr of fehlendeObjekte) {
        const [neu] = await tx
          .insert(objekte)
          .values({ name: `Objekt ${nr}`, objektNr: nr })
          .returning({ id: objekte.id });
        objektNachNr.set(nr, neu!.id);
      }
      console.log(
        `\nAngelegt: ${fehlendePersonen.size} Mitarbeiter, ${fehlendeObjekte.size} Objekte.`,
      );
    }

    if ((vorhanden?.anzahl ?? 0) > 0 && vonDatum && bisDatum) {
      await tx
        .delete(eintraegeTabelle)
        .where(and(gte(eintraegeTabelle.datum, vonDatum), lt(eintraegeTabelle.datum, bisDatum)));
      console.log(`Gelöscht: ${vorhanden?.anzahl} vorhandene Einträge dieser Monate.`);
    }

    const zuSchreiben = alleEintraege
      .filter((e) => personNachNr.has(e.personalnummer))
      .filter((e) => e.objektNr === null || objektNachNr.has(e.objektNr))
      .map((e) => ({
        mitarbeiterId: personNachNr.get(e.personalnummer)!,
        objektId: e.objektNr ? (objektNachNr.get(e.objektNr) ?? null) : null,
        datum: e.datum,
        art: e.art,
        wert: e.wert,
      }));

    const uebersprungen = alleEintraege.length - zuSchreiben.length;

    // In Häppchen, sonst wird die Anweisung bei tausenden Zeilen zu gross.
    for (let i = 0; i < zuSchreiben.length; i += 500) {
      await tx.insert(eintraegeTabelle).values(zuSchreiben.slice(i, i + 500));
    }

    await protokolliere({
      benutzer: undefined,
      aktion: "anlegen",
      tabelle: "eintraege",
      nachher: {
        quelle: "Excel-Import",
        dateien: gelesen.map((g) => g.datei),
        monate,
        geschrieben: zuSchreiben.length,
        uebersprungen,
      },
    });

    console.log(`\nGeschrieben: ${zuSchreiben.length} Einträge.`);
    if (uebersprungen > 0) {
      console.log(`Übersprungen: ${uebersprungen} (unbekannte Personal- oder Objektnummer).`);
    }
  });

  console.log("\nFertig.\n");
} catch (fehler) {
  console.error("\nImport fehlgeschlagen, es wurde nichts geschrieben:\n", fehler);
  process.exitCode = 1;
} finally {
  await datenbankSchliessen();
}
