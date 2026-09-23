/**
 * Vergleichstest: alter Rechenkern gegen neuen.
 *
 * Statt die Portierung gegen einen einzigen echten Monat zu prüfen,
 * lassen wir beide Fassungen mit tausenden zufällig erzeugten Szenarien
 * rechnen und vergleichen jede einzelne Zahl. Das deckt deutlich mehr
 * Fälle ab als ein Monat, und es braucht keine einzige echte Lohnzahl.
 *
 * Verglichen wird auf exakte Gleichheit, nicht auf "ungefähr". Die
 * Portierung hält die Reihenfolge der Rechenschritte ein, also müssen
 * auch die letzten Stellen uebereinstimmen. Sobald hier ein Rappen
 * abweicht, wurde beim Umbau etwas umgestellt.
 *
 * Der Test fällt weg, sobald legacy/ gelöscht wird. Genau dann wird er
 * auch nicht mehr gebraucht.
 */
import { describe, expect, test } from "vitest";
// @ts-expect-error -- das Altsystem ist reines JavaScript ohne Typen.
import * as alt from "../../../legacy/src/kalkulation.js";
import { rechne } from "./kalkulation.js";
import type {
  Adminposten,
  Ansaetze,
  Eintrag,
  MitarbeiterSatz,
  ObjektMonat,
  PersonMonat,
} from "./kalkulation.js";

/** Zufall mit festem Startwert, damit ein Fehlschlag wiederholbar ist. */
function wuerfel(startwert: number) {
  let zustand = startwert >>> 0;
  return () => {
    zustand = (zustand + 0x6d2b79f5) >>> 0;
    let t = zustand;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Szenario = {
  monat: string;
  s: Ansaetze;
  objektMonat: ObjektMonat[];
  personMonat: PersonMonat[];
  adminkosten: Adminposten[];
  eintraege: Eintrag[];
  mitarbeiter: MitarbeiterSatz[];
};

function baueSzenario(rnd: () => number): Szenario {
  const zahl = (min: number, max: number, stellen = 2) =>
    Number((min + rnd() * (max - min)).toFixed(stellen));
  const ja = (wahrscheinlichkeit = 0.5) => rnd() < wahrscheinlichkeit;

  const s: Ansaetze = {
    ahv: zahl(0, 0.08, 6),
    alv: zahl(0, 0.03, 6),
    nbu: zahl(0, 0.03, 6),
    bu: zahl(0, 0.03, 6),
    ktgObjekt: zahl(0, 0.02, 6),
    ktgPersonal: zahl(0, 0.02, 6),
    rpk: zahl(0, 0.01, 6),
    fak: zahl(0, 0.03, 6),
    ml13: zahl(0, 0.1, 6),
    nbuSchwelle: ja(0.8) ? zahl(0, 20, 1) : 0,
    nbuTraegtAg: ja(),
    bvgSatz: zahl(0, 0.15, 6),
    bvgEintritt: zahl(0, 40000),
    bvgKoord: zahl(0, 40000),
    bvgMin: zahl(0, 8000),
    bvgMax: zahl(20000, 90000),
    mat: zahl(0, 40),
    mas: zahl(0, 40),
    trs: zahl(0, 30),
    trsTopf: ja(0.6) ? zahl(0, 3000) : 0,
    trsSchluessel: ja() ? "abos" : "objekt",
    adminReserve: zahl(0, 0.3, 4),
  };

  const anzahlObjekte = Math.floor(rnd() * 6);
  const objektMonat: ObjektMonat[] = Array.from({ length: anzahlObjekte }, (_, i) => ({
    objektId: `o${i}`,
    aboBetrag: ja(0.9) ? zahl(0, 5000) : 0,
    stdManuell: ja(0.6) ? zahl(0, 200, 2) : 0,
    lohnManuell: ja(0.7) ? zahl(0, 60) : 0,
    ma: ja(0.9) ? zahl(0, 5, 1) : 0,
    aktiv: ja(0.75),
  }));

  const anzahlPersonen = Math.floor(rnd() * 5);
  const personMonat: PersonMonat[] = Array.from({ length: anzahlPersonen }, (_, i) => ({
    mitarbeiterId: `p${i}`,
    lohn: zahl(0, 9000),
    spesen: ja(0.4) ? zahl(0, 500) : 0,
    ml13: ja(),
    abzugAhv: ja(0.85),
    abzugAlv: ja(0.85),
    abzugRpk: ja(0.85),
    abzugFak: ja(0.85),
    // Drei Fälle: Handeingabe, leer als Text, gar nichts.
    fakManuell: ja(0.25) ? zahl(0, 400) : ja(0.5) ? "" : null,
    bvg: ja(0.8),
    bvgManuell: ja(0.25) ? zahl(0, 900) : ja(0.5) ? "" : null,
  }));

  const anzahlMitarbeiter = Math.floor(rnd() * 6);
  const mitarbeiter: MitarbeiterSatz[] = Array.from({ length: anzahlMitarbeiter }, (_, i) => ({
    id: `m${i}`,
    // Manche ohne Stundenlohn: das soll als Warnung gezählt werden.
    stundenlohn: ja(0.75) ? zahl(0, 70) : 0,
  }));

  const eintraege: Eintrag[] = [];
  const anzahlEintraege = Math.floor(rnd() * 40);
  for (let i = 0; i < anzahlEintraege; i++) {
    const zumObjekt = anzahlObjekte > 0 && ja(0.85);
    const arbeit = ja(0.8);
    eintraege.push({
      mitarbeiterId: anzahlMitarbeiter > 0 ? `m${Math.floor(rnd() * anzahlMitarbeiter)}` : "mX",
      objektId: zumObjekt ? `o${Math.floor(rnd() * anzahlObjekte)}` : null,
      // Auch ein Eintrag aus dem Nachbarmonat, der herausgefiltert werden muss.
      datum: ja(0.9)
        ? `2026-02-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`
        : "2026-03-05",
      art: arbeit ? "arbeit" : ja() ? "ferien" : "krankheit",
      wert: zahl(0, 12, 2),
    });
  }

  const adminkosten: Adminposten[] = Array.from({ length: Math.floor(rnd() * 8) }, (_, i) => ({
    position: `Posten ${i}`,
    betrag: zahl(0, 2000),
  }));

  return { monat: "2026-02-01", s, objektMonat, personMonat, adminkosten, eintraege, mitarbeiter };
}

/** Übersetzt ein Szenario in die Feldnamen des Altsystems. */
function fuerAlt(sz: Szenario) {
  return {
    monat: sz.monat,
    s: {
      ahv: sz.s.ahv,
      alv: sz.s.alv,
      nbu: sz.s.nbu,
      bu: sz.s.bu,
      ktg_objekt: sz.s.ktgObjekt,
      ktg_personal: sz.s.ktgPersonal,
      rpk: sz.s.rpk,
      fak: sz.s.fak,
      ml13: sz.s.ml13,
      nbu_schwelle: sz.s.nbuSchwelle,
      nbu_traegt_ag: sz.s.nbuTraegtAg,
      bvg_satz: sz.s.bvgSatz,
      bvg_eintritt: sz.s.bvgEintritt,
      bvg_koord: sz.s.bvgKoord,
      bvg_min: sz.s.bvgMin,
      bvg_max: sz.s.bvgMax,
      mat: sz.s.mat,
      mas: sz.s.mas,
      trs: sz.s.trs,
      trs_topf: sz.s.trsTopf,
      trs_schluessel: sz.s.trsSchluessel,
      admin_reserve: sz.s.adminReserve,
    },
    objektMonat: sz.objektMonat.map((o) => ({
      objekt_id: o.objektId,
      abo_betrag: o.aboBetrag,
      std_manuell: o.stdManuell,
      lohn_manuell: o.lohnManuell,
      ma: o.ma,
      aktiv: o.aktiv,
    })),
    personMonat: sz.personMonat.map((p) => ({
      employee_id: p.mitarbeiterId,
      lohn: p.lohn,
      spesen: p.spesen,
      ml13: p.ml13,
      abzug_ahv: p.abzugAhv,
      abzug_alv: p.abzugAlv,
      abzug_rpk: p.abzugRpk,
      abzug_fak: p.abzugFak,
      fak_manuell: p.fakManuell,
      bvg: p.bvg,
      bvg_manuell: p.bvgManuell,
    })),
    adminkosten: sz.adminkosten.map((a) => ({ position: a.position, betrag: a.betrag })),
    entries: sz.eintraege.map((e) => ({
      employee_id: e.mitarbeiterId,
      objekt_id: e.objektId,
      date: e.datum,
      type: e.art,
      value: e.wert,
    })),
    employees: sz.mitarbeiter.map((m) => ({ id: m.id, stundenlohn: m.stundenlohn })),
  };
}

/** Alle Zahlen eines Ergebnisses, flach und vergleichbar. */
function zahlenVon(ergebnis: {
  obj: Record<string, unknown>[];
  staff: Record<string, unknown>[];
  t: Record<string, number>;
  res: Record<string, number>;
}): Record<string, number> {
  const flach: Record<string, number> = {};

  ergebnis.obj.forEach((r, i) => {
    for (const [feld, wert] of Object.entries(r)) {
      if (typeof wert === "number") flach[`obj[${i}].${feld}`] = wert;
    }
  });
  ergebnis.staff.forEach((r, i) => {
    for (const [feld, wert] of Object.entries(r)) {
      if (typeof wert === "number") flach[`staff[${i}].${feld}`] = wert;
    }
  });
  for (const [feld, wert] of Object.entries(ergebnis.t)) flach[`t.${feld}`] = wert;
  for (const [feld, wert] of Object.entries(ergebnis.res)) flach[`res.${feld}`] = wert;

  return flach;
}

describe("Portierung: alt gegen neu", () => {
  test("3000 zufällige Szenarien liefern exakt dieselben Zahlen", () => {
    const rnd = wuerfel(20260921);
    let verglichen = 0;

    for (let lauf = 0; lauf < 3000; lauf++) {
      const sz = baueSzenario(rnd);

      const neu = zahlenVon(rechne(sz) as unknown as Parameters<typeof zahlenVon>[0]);
      const frueher = zahlenVon(
        (alt as { rechne: (e: unknown) => unknown }).rechne(fuerAlt(sz)) as Parameters<
          typeof zahlenVon
        >[0],
      );

      expect(Object.keys(neu).sort()).toEqual(Object.keys(frueher).sort());

      for (const feld of Object.keys(neu)) {
        if (neu[feld] !== frueher[feld]) {
          throw new Error(
            `Lauf ${lauf}, Feld ${feld}: alt=${frueher[feld]} neu=${neu[feld]}\n` +
              `Szenario: ${JSON.stringify(sz).slice(0, 600)}`,
          );
        }
        verglichen++;
      }
    }

    // Damit der Test nicht still durchläuft, wenn die Szenarien leer sind.
    expect(verglichen).toBeGreaterThan(50_000);
  });

  test("bvgAuto stimmt über die ganze Bandbreite überein", () => {
    const rnd = wuerfel(7);
    const s = baueSzenario(rnd).s;

    for (let i = 0; i < 2000; i++) {
      const lohn = Number((rnd() * 15000).toFixed(2));
      const neu = rechne({
        monat: "2026-02-01",
        s,
        objektMonat: [],
        adminkosten: [],
        personMonat: [
          {
            mitarbeiterId: "p",
            lohn,
            spesen: 0,
            ml13: false,
            abzugAhv: false,
            abzugAlv: false,
            abzugRpk: false,
            abzugFak: false,
            fakManuell: null,
            bvg: true,
            bvgManuell: null,
          },
        ],
      }).staff[0]?.bvg as number;

      const frueher = (alt as { bvgAuto: (l: number, s: unknown) => number }).bvgAuto(
        lohn,
        fuerAlt({ ...baueSzenario(wuerfel(7)), s } as Szenario).s,
      );

      expect(neu).toBe(frueher);
    }
  });
});
