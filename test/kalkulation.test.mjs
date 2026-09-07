/* Regressionstests fuer den Rechenkern.
   Laufen ohne Zusatzpakete: `npm test` (Node 18+). */
import test from "node:test";
import assert from "node:assert/strict";
import { rechne, bvgAuto, stundenJeObjekt, z } from "../src/kalkulation.js";

const MONAT = "2026-02-01";

/* Ansaetze wie in der Migration voreingestellt. */
const ansaetze = () => ({
  ahv: 0.053, alv: 0.011, nbu: 0.0138, bu: 0.014494,
  ktg_objekt: 0.00796, ktg_personal: 0.00825, rpk: 0.002, fak: 0.012,
  ml13: 0.0833, nbu_schwelle: 8, nbu_traegt_ag: false,
  bvg_satz: 0.07, bvg_eintritt: 22680, bvg_koord: 26460,
  bvg_min: 3780, bvg_max: 64260,
  mat: 15, mas: 15, trs: 0, trs_topf: 0, trs_schluessel: "abos",
  admin_reserve: 0.10,
});

const nah = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} != ${b}`);

test("aktives Objekt: Loehne, Sozialabgaben und Deckungsbeitrag", () => {
  const s = ansaetze();
  const c = rechne({
    monat: MONAT, s, adminkosten: [], personMonat: [],
    objektMonat: [{ monat: MONAT, objekt_id: "o1", abo_betrag: 1000, std_manuell: 20, lohn_manuell: 25, ma: 1, aktiv: true }],
  });
  const r = c.obj[0];
  nah(r.loehne, 500, "Loehne = 20 Std * 25 CHF");
  nah(r.ahv, 500 * 0.053, "AHV");
  nah(r.nbu, 0, "NBU traegt der Arbeitnehmer");
  nah(r.lohnSz, 500 * (1 + 0.053 + 0.011 + 0.014494 + 0.00796 + 0.002), "Lohn inkl. SZ");
  nah(r.zt, 1000 - r.lohnSz, "Zwischentotal");
  nah(r.gew, r.zt - 15 - 15, "Gewinn nach Material und Maschinen");
});

test("inaktives Objekt liefert weder Umsatz noch Gewinn", () => {
  const s = ansaetze();
  const objektMonat = [
    { monat: MONAT, objekt_id: "o1", abo_betrag: 1000, std_manuell: 20, lohn_manuell: 25, ma: 1, aktiv: true },
    { monat: MONAT, objekt_id: "o2", abo_betrag: 5000, std_manuell: 40, lohn_manuell: 25, ma: 1, aktiv: false },
  ];
  const c = rechne({ monat: MONAT, s, objektMonat, personMonat: [], adminkosten: [] });
  const inaktiv = c.obj.find((r) => r.o.objekt_id === "o2");

  nah(inaktiv.zt, 0, "kein Zwischentotal");
  nah(inaktiv.gew, 0, "kein Gewinn aus dem Nichts");
  nah(c.t.abos, 1000, "nur das aktive Abo zaehlt als Umsatz");
  nah(c.t.stdTotal, 20, "nur Stunden aktiver Objekte");

  const nurAktiv = rechne({ monat: MONAT, s, personMonat: [], adminkosten: [],
    objektMonat: [objektMonat[0]] });
  nah(c.res.ergebnis, nurAktiv.res.ergebnis, "Ergebnis unabhaengig vom inaktiven Objekt");
});

test("Administration wird vollstaendig auf die aktiven Objekte umgelegt", () => {
  const s = ansaetze();
  const c = rechne({
    monat: MONAT, s, personMonat: [],
    adminkosten: [{ id: "a1", betrag: 1000 }],
    objektMonat: [
      { monat: MONAT, objekt_id: "o1", abo_betrag: 1000, std_manuell: 10, lohn_manuell: 25, ma: 1, aktiv: true },
      { monat: MONAT, objekt_id: "o2", abo_betrag: 3000, std_manuell: 30, lohn_manuell: 25, ma: 1, aktiv: true },
      { monat: MONAT, objekt_id: "o3", abo_betrag: 9999, std_manuell: 10, lohn_manuell: 25, ma: 1, aktiv: false },
    ],
  });
  nah(c.res.adminTopf, 1100, "Topf inkl. 10% Reserve");
  nah(c.obj.reduce((a, r) => a + r.admin, 0), 1100, "Umlage deckt den ganzen Topf");
  nah(c.obj.find((r) => r.o.objekt_id === "o1").admin, 1100 * 0.25, "Anteil nach Aboanteil");
});

test("Treibstoff gleichmaessig pro Objekt trifft nur aktive Objekte", () => {
  const s = { ...ansaetze(), trs_topf: 300, trs_schluessel: "objekt" };
  const c = rechne({
    monat: MONAT, s, personMonat: [], adminkosten: [],
    objektMonat: [
      { monat: MONAT, objekt_id: "o1", abo_betrag: 1000, std_manuell: 10, lohn_manuell: 25, ma: 1, aktiv: true },
      { monat: MONAT, objekt_id: "o2", abo_betrag: 1000, std_manuell: 10, lohn_manuell: 25, ma: 1, aktiv: true },
      { monat: MONAT, objekt_id: "o3", abo_betrag: 1000, std_manuell: 10, lohn_manuell: 25, ma: 1, aktiv: false },
    ],
  });
  nah(c.obj.find((r) => r.o.objekt_id === "o1").trs, 150, "Topf auf zwei aktive Objekte");
  nah(c.obj.find((r) => r.o.objekt_id === "o3").trs, 0, "inaktiv zahlt nichts");
});

test("erfasste Stunden schlagen die Handeingabe", () => {
  const s = ansaetze();
  const employees = [{ id: "e1", name: "A", stundenlohn: 30 }];
  const entries = [
    { id: "x1", employee_id: "e1", objekt_id: "o1", date: "2026-02-03", type: "arbeit", value: 6 },
    { id: "x2", employee_id: "e1", objekt_id: "o1", date: "2026-02-04", type: "arbeit", value: 4 },
    { id: "x3", employee_id: "e1", objekt_id: "o1", date: "2026-03-04", type: "arbeit", value: 99 },
  ];
  const c = rechne({
    monat: MONAT, s, personMonat: [], adminkosten: [], entries, employees,
    objektMonat: [{ monat: MONAT, objekt_id: "o1", abo_betrag: 1000, std_manuell: 20, lohn_manuell: 25, ma: 1, aktiv: true }],
  });
  const r = c.obj[0];
  assert.equal(r.ausErfassung, true);
  nah(r.std, 10, "nur der laufende Monat");
  nah(r.loehne, 300, "Lohnsumme aus dem Stundenlohn der Person");
});

test("Person ohne Stundenlohn wird als Warnung gemeldet", () => {
  const employees = [{ id: "e1", name: "A", stundenlohn: null }];
  const entries = [{ id: "x1", employee_id: "e1", objekt_id: "o1", date: "2026-02-03", type: "arbeit", value: 8 }];
  const map = stundenJeObjekt(entries, employees, MONAT);
  assert.equal(map.get("o1").std, 8);
  assert.equal(map.get("o1").lohnsumme, 0);
  assert.equal(map.get("o1").ohneLohn.size, 1);
});

test("NBU: nur wenn der Arbeitgeber sie traegt und die Schwelle erreicht ist", () => {
  const employees = [
    { id: "viel", name: "Viel", stundenlohn: 30 },
    { id: "wenig", name: "Wenig", stundenlohn: 30 },
  ];
  // Schwelle: 8 Std./Woche * 52 / 12 = 34.67 Std./Monat
  const entries = [
    { id: "a", employee_id: "viel", objekt_id: "o1", date: "2026-02-03", type: "arbeit", value: 40 },
    { id: "b", employee_id: "wenig", objekt_id: "o1", date: "2026-02-04", type: "arbeit", value: 10 },
  ];
  const objektMonat = [{ monat: MONAT, objekt_id: "o1", abo_betrag: 1000, ma: 1, aktiv: true }];

  const aus = rechne({ monat: MONAT, s: ansaetze(), objektMonat, personMonat: [], adminkosten: [], entries, employees });
  nah(aus.obj[0].nbu, 0, "abgeschaltet = keine Arbeitgeberkost");

  const ein = rechne({ monat: MONAT, s: { ...ansaetze(), nbu_traegt_ag: true },
    objektMonat, personMonat: [], adminkosten: [], entries, employees });
  nah(ein.obj[0].nbu, 40 * 30 * 0.0138, "nur die Person ueber der Schwelle");
});

test("BVG: Eintrittsschwelle, Koordinationsabzug und Bandbreite", () => {
  const s = ansaetze();
  nah(bvgAuto(1800, s), 0, "unter der Eintrittsschwelle");
  nah(bvgAuto(3000, s), Math.max(3000 * 12 - 26460, 3780) * 0.07 / 12, "koordinierter Lohn");
  nah(bvgAuto(2000, s), 3780 * 0.07 / 12, "Minimum greift");
  nah(bvgAuto(20000, s), 64260 * 0.07 / 12, "Maximum greift");
});

test("Handeingabe: manuelle FAK und BVG schlagen die Automatik", () => {
  const s = ansaetze();
  const personMonat = [
    { monat: MONAT, employee_id: "p1", lohn: 5000, spesen: 100, ml13: true,
      abzug_ahv: true, abzug_alv: true, abzug_rpk: true, abzug_fak: true,
      fak_manuell: 42, bvg: true, bvg_manuell: 99 },
  ];
  const c = rechne({ monat: MONAT, s, objektMonat: [], personMonat, adminkosten: [] });
  const x = c.staff[0];
  nah(x.fak, 42, "FAK ueberschrieben");
  nah(x.bvg, 99, "BVG ueberschrieben");
  nah(x.ml13, 5000 * 0.0833, "13. Monatslohn");
  nah(x.lohnSz, 5000 + 100 + x.ml13 + x.ahv + x.alv + x.nbu + x.bu + x.ktg + x.rpk + 42 + 99, "Summe");
});

test("Ueberleitung Deckungsbeitrag zu Ergebnis geht auf", () => {
  const s = ansaetze();
  const c = rechne({
    monat: MONAT, s,
    adminkosten: [{ id: "a1", betrag: 500 }],
    personMonat: [{ monat: MONAT, employee_id: "p1", lohn: 4000, spesen: 0, ml13: false,
      abzug_ahv: true, abzug_alv: true, abzug_rpk: true, abzug_fak: true, bvg: true }],
    objektMonat: [
      { monat: MONAT, objekt_id: "o1", abo_betrag: 2000, std_manuell: 40, lohn_manuell: 26, ma: 1, aktiv: true },
      { monat: MONAT, objekt_id: "o2", abo_betrag: 800, std_manuell: 0, lohn_manuell: 0, ma: 1, aktiv: true },
    ],
  });
  nah(c.t.gew + c.res.beitragOhneStd - c.t.lohnSzPers, c.res.ergebnis, "Ueberleitung");
  nah(c.res.ergebnis, c.t.abos - c.t.lohnSzObj - c.t.lohnSzPers - c.t.mat - c.t.mas - c.t.trs - c.t.admin, "Ergebnis");
  assert.equal(c.res.ohneStd, 1);
  nah(c.res.abosOhneGew, 800, "Abo des Objekts ohne Stunden");
});

test("z() faengt fehlende und unsinnige Werte ab", () => {
  assert.equal(z(null), 0);
  assert.equal(z(undefined), 0);
  assert.equal(z("12"), 0);
  assert.equal(z(NaN), 0);
  assert.equal(z(Infinity), 0);
  assert.equal(z(3.5), 3.5);
});
