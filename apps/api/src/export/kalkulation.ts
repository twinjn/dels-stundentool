/**
 * Die Kalkulation als Excel-Arbeitsmappe.
 *
 * Gerechnet wird mit rechne() aus @dels/shared, derselben Funktion, die
 * auch der Browser benutzt. Das ist der ganze Punkt der Übung: wer den
 * Export mit dem Bildschirm vergleicht, findet dieselben Zahlen, weil es
 * dieselbe Rechnung ist und nicht eine zweite Fassung davon.
 *
 * Vier Blätter: Zusammenfassung, Objekte, Personal, Adminkosten. Die
 * Ansätze stehen mit im Blatt "Zusammenfassung", damit ein exportierter
 * Monat auch in einem Jahr noch erklärt, womit er gerechnet wurde.
 */
import { rechne } from "@dels/shared";
import { kalkulationsdaten } from "../kalkulation/daten.js";
import {
  alsZahl,
  blatt,
  mappe,
  F_GANZ,
  F_PROZENT,
  F_STUNDEN,
  F_ZAHL,
  type Zellwert,
} from "./arbeitsmappe.js";
import { jetztInZuerich, monatTitel } from "./stunden.js";

type Daten = Awaited<ReturnType<typeof kalkulationsdaten>>;

/** Die Ansätze als lesbare Paare, mit passendem Format je Zeile. */
function ansatzzeilen(s: Daten["ansaetze"]): { zeilen: Zellwert[][]; prozent: Set<number> } {
  const paare: [string, number | string | null, boolean][] = [
    ["AHV", alsZahl(s.ahv), true],
    ["ALV", alsZahl(s.alv), true],
    ["NBU", alsZahl(s.nbu), true],
    ["NBU trägt Arbeitgeber", s.nbuTraegtAg ? "ja" : "nein", false],
    ["NBU-Schwelle (Std./Woche)", alsZahl(s.nbuSchwelle), false],
    ["BU", alsZahl(s.bu), true],
    ["KTG Objekt", alsZahl(s.ktgObjekt), true],
    ["KTG Personal", alsZahl(s.ktgPersonal), true],
    ["RPK", alsZahl(s.rpk), true],
    ["FAK", alsZahl(s.fak), true],
    ["13. Monatslohn", alsZahl(s.ml13), true],
    ["BVG-Satz", alsZahl(s.bvgSatz), true],
    ["BVG Eintrittsschwelle", alsZahl(s.bvgEintritt), false],
    ["BVG Koordinationsabzug", alsZahl(s.bvgKoord), false],
    ["BVG Minimum", alsZahl(s.bvgMin), false],
    ["BVG Maximum", alsZahl(s.bvgMax), false],
    ["Material je Objekt", alsZahl(s.mat), false],
    ["Maschinen je Objekt", alsZahl(s.mas), false],
    ["Treibstoff je Objekt", alsZahl(s.trs), false],
    ["Treibstoff-Topf", alsZahl(s.trsTopf), false],
    ["Treibstoff-Verteilung", s.trsSchluessel, false],
    ["Administrationsreserve", alsZahl(s.adminReserve), true],
  ];

  const zeilen: Zellwert[][] = [];
  const prozent = new Set<number>();
  for (const [bezeichnung, wert, istProzent] of paare) {
    if (istProzent) prozent.add(zeilen.length);
    zeilen.push([bezeichnung, wert]);
  }
  return { zeilen, prozent };
}

export function kalkulationsmappe(daten: Daten, erstelltAm = jetztInZuerich()): Buffer {
  const ergebnis = rechne({
    monat: daten.monat,
    s: daten.ansaetze,
    objektMonat: daten.objektMonat,
    personMonat: daten.personMonat,
    adminkosten: daten.adminkosten,
    eintraege: daten.eintraege,
    mitarbeiter: daten.mitarbeiter,
  });

  const { t, res } = ergebnis;
  const namen = new Map(daten.objektMonat.map((o) => [o.objektId, o]));
  const personen = new Map(daten.personMonat.map((p) => [p.mitarbeiterId, p]));

  // --- Zusammenfassung ---------------------------------------------------
  const zusammen: Zellwert[][] = [];
  zusammen.push([`Kalkulation ${monatTitel(daten.monat.slice(0, 7))}`]);
  zusammen.push([`Erstellt am ${erstelltAm}`]);
  zusammen.push([]);
  zusammen.push(["Ergebnis", "CHF"]);

  const ergebniszeilen: [string, number][] = [
    ["Abonnemente (Umsatz)", t.abos!],
    ["Loehne", t.loehne!],
    ["Spesen", t.spesen!],
    ["13. Monatslohn", t.ml13!],
    ["AHV", t.ahv!],
    ["ALV", t.alv!],
    ["NBU", t.nbu!],
    ["BU", t.bu!],
    ["KTG", t.ktg!],
    ["RPK", t.rpk!],
    ["FAK", t.fak!],
    ["BVG", t.bvg!],
    ["Lohn inkl. Sozialkosten, total", t.lohnSzAlle!],
    ["davon Objekte", t.lohnSzObj!],
    ["davon Personal", t.lohnSzPers!],
    ["Material", t.mat!],
    ["Maschinen", t.mas!],
    ["Treibstoff", t.trs!],
    ["Administration", t.admin!],
    ["Betriebsergebnis", res.ergebnis],
  ];
  const ergebnisAb = zusammen.length;
  for (const [bezeichnung, wert] of ergebniszeilen) zusammen.push([bezeichnung, wert]);

  zusammen.push([]);
  const margeZeile = zusammen.length;
  zusammen.push(["Marge", res.marge]);
  zusammen.push(["Stunden total", t.stdTotal!]);

  // Anzahlen, keine Betraege. "35.00 Mitarbeiter" liest sich falsch.
  const ganzeZahlen: [string, number][] = [
    ["Mitarbeiter gerechnet", t.maTotal!],
    ["Objekte mit erfassten Stunden", t.ausErfassung!],
    ["Objekte ohne Stunden", res.ohneStd],
    ["Personen ohne Stundenlohn", t.ohneLohnsatz!],
  ];
  const ganzAb = zusammen.length;
  for (const zeile of ganzeZahlen) zusammen.push(zeile);

  zusammen.push([]);
  zusammen.push(["Angewandte Ansätze", ""]);
  const ansaetzeAb = zusammen.length;
  const { zeilen: ansatz, prozent } = ansatzzeilen(daten.ansaetze);
  for (const zeile of ansatz) zusammen.push(zeile);

  // Prozentzeilen bekommen das Prozentformat, alles andere Franken. Der
  // Umweg über zwei Blätter wäre sauberer, aber hier sind es 22 Zeilen.
  const zusammenBlatt = blatt({
    zeilen: zusammen,
    breiten: [38, 16],
    formate: { 1: F_ZAHL },
    datenAb: ergebnisAb,
  });
  for (const versatz of prozent) {
    const zelle = zusammenBlatt[`B${ansaetzeAb + versatz + 1}`] as { t?: string; z?: string };
    if (zelle?.t === "n") zelle.z = F_PROZENT;
  }
  {
    const zelle = zusammenBlatt[`B${margeZeile + 1}`] as { t?: string; z?: string };
    if (zelle?.t === "n") zelle.z = F_PROZENT;
  }
  for (let i = 0; i < ganzeZahlen.length; i++) {
    const zelle = zusammenBlatt[`B${ganzAb + i + 1}`] as { t?: string; z?: string };
    if (zelle?.t === "n") zelle.z = F_GANZ;
  }

  // --- Objekte -----------------------------------------------------------
  const objekte: Zellwert[][] = [
    [
      "Objekt-Nr",
      "Objekt",
      "Aktiv",
      "Abo CHF",
      "Stunden",
      "Quelle",
      "Personen",
      "Loehne",
      "AHV",
      "ALV",
      "NBU",
      "BU",
      "KTG",
      "RPK",
      "Lohn inkl. SZ",
      "Deckungsbeitrag",
      "Material",
      "Maschinen",
      "Treibstoff",
      "Administration",
      "Gewinn",
    ],
  ];
  for (const r of ergebnis.obj) {
    const stamm = namen.get(r.o.objektId);
    objekte.push([
      stamm?.objektNr ?? null,
      stamm?.objektName ?? r.o.objektId,
      r.o.aktiv ? "ja" : "nein",
      r.abo,
      r.std,
      r.ausErfassung ? "Erfassung" : "Handeingabe",
      r.personen,
      r.loehne,
      r.ahv,
      r.alv,
      r.nbu,
      r.bu,
      r.ktg,
      r.rpk,
      r.lohnSz,
      r.zt,
      r.mat,
      r.mas,
      r.trs,
      r.admin,
      r.gew,
    ]);
  }

  // --- Personal ----------------------------------------------------------
  const personal: Zellwert[][] = [
    [
      "Pers.Nr",
      "Name",
      "Lohn",
      "Spesen",
      "13. ML",
      "AHV",
      "ALV",
      "NBU",
      "BU",
      "KTG",
      "RPK",
      "FAK",
      "BVG",
      "Lohn inkl. SZ",
    ],
  ];
  for (const r of ergebnis.staff) {
    const stamm = personen.get(r.p.mitarbeiterId);
    personal.push([
      stamm?.personalnummer ?? null,
      stamm?.name ?? r.p.mitarbeiterId,
      r.lohn,
      alsZahl(r.p.spesen) ?? 0,
      r.ml13,
      r.ahv,
      r.alv,
      r.nbu,
      r.bu,
      r.ktg,
      r.rpk,
      r.fak,
      r.bvg,
      r.lohnSz,
    ]);
  }

  // --- Adminkosten -------------------------------------------------------
  const admin: Zellwert[][] = [["Position", "Betrag CHF"]];
  for (const posten of daten.adminkosten) {
    admin.push([posten.position ?? "", alsZahl(posten.betrag)]);
  }
  admin.push([]);
  admin.push([
    "Summe der Posten",
    daten.adminkosten.reduce((a, p) => a + (alsZahl(p.betrag) ?? 0), 0),
  ]);
  admin.push(["Zuzueglich Reserve", res.adminTopf]);

  const geldSpalten = (von: number, bis: number): Record<number, string> => {
    const formate: Record<number, string> = {};
    for (let i = von; i <= bis; i++) formate[i] = F_ZAHL;
    return formate;
  };

  return mappe([
    { name: "Zusammenfassung", blatt: zusammenBlatt },
    {
      name: "Objekte",
      blatt: blatt({
        zeilen: objekte,
        breiten: [12, 30, 7, 12, 10, 13, 10, ...Array<number>(14).fill(13)],
        formate: { 4: F_STUNDEN, 6: F_GANZ, ...geldSpalten(7, 20), 3: F_ZAHL },
        datenAb: 1,
      }),
    },
    {
      name: "Personal",
      blatt: blatt({
        zeilen: personal,
        breiten: [10, 28, ...Array<number>(12).fill(12)],
        formate: geldSpalten(2, 13),
        datenAb: 1,
      }),
    },
    {
      name: "Adminkosten",
      blatt: blatt({ zeilen: admin, breiten: [34, 14], formate: { 1: F_ZAHL }, datenAb: 1 }),
    },
  ]);
}

export async function kalkulationsmappeFuerMonat(monat: string): Promise<Buffer> {
  return kalkulationsmappe(await kalkulationsdaten(monat));
}
