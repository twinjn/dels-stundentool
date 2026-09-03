/* ============================================================
   Rechenkern der Kalkulation

   Portiert aus der geprueften Excel-Nachrechnung. Die Formeln sind
   dieselben, nur die Datenherkunft ist anders: Stunden und Loehne
   kommen aus dem Stundentool, sobald dort etwas erfasst ist.

   Reine Funktionen, kein React, kein Supabase -- damit laesst sich
   das Ergebnis gegen das Excel gegenrechnen.
   ============================================================ */

export const z = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

/** BVG-Arbeitgeberbeitrag auf dem koordinierten Lohn, pro Monat. */
export function bvgAuto(lohn, s) {
  const jahr = z(lohn) * 12;
  if (jahr < z(s.bvg_eintritt)) return 0;
  return (
    Math.min(Math.max(jahr - z(s.bvg_koord), z(s.bvg_min)), z(s.bvg_max)) *
    z(s.bvg_satz) / 12
  );
}

/**
 * Stunden und Lohnsumme je Objekt aus den erfassten Eintraegen.
 * Liefert eine Map objekt_id -> { std, lohnsumme, personen:Set }.
 * Ohne hinterlegten Stundenlohn zaehlt die Person zwar mit ihren
 * Stunden, steuert aber keinen Lohn bei -- das wird in der Ansicht
 * als Warnung sichtbar gemacht.
 */
export function stundenJeObjekt(entries, employees, monat) {
  const lohnVon = new Map(employees.map((e) => [e.id, z(e.stundenlohn)]));
  const map = new Map();
  for (const e of entries) {
    if (e.type !== "arbeit" || !e.objekt_id) continue;
    if (!e.date.startsWith(monat.slice(0, 7))) continue;
    let r = map.get(e.objekt_id);
    if (!r) { r = { std: 0, lohnsumme: 0, personen: new Set(), ohneLohn: new Set() }; map.set(e.objekt_id, r); }
    const std = z(e.value);
    const satz = lohnVon.get(e.employee_id) || 0;
    r.std += std;
    r.lohnsumme += std * satz;
    r.personen.add(e.employee_id);
    if (!satz) r.ohneLohn.add(e.employee_id);
  }
  return map;
}

/** Stunden je Person im Monat, fuer die NBU-Schwelle. */
export function stundenJePerson(entries, monat) {
  const map = new Map();
  for (const e of entries) {
    if (e.type !== "arbeit") continue;
    if (!e.date.startsWith(monat.slice(0, 7))) continue;
    map.set(e.employee_id, (map.get(e.employee_id) || 0) + z(e.value));
  }
  return map;
}

/**
 * @param monat        "2026-02-01"
 * @param s            Zeile aus kalk_monat
 * @param objektMonat  Zeilen aus kalk_objekt_monat, je mit .objekt (Stammsatz)
 * @param personMonat  Zeilen aus kalk_person_monat, je mit .employee
 * @param adminkosten  Zeilen aus kalk_adminkosten
 * @param entries      alle Eintraege (werden nach Monat gefiltert)
 * @param employees    Stammsaetze, fuer die Stundenloehne
 */
export function rechne({ monat, s, objektMonat, personMonat, adminkosten, entries = [], employees = [] }) {
  const adminTopf =
    adminkosten.reduce((a, p) => a + z(p.betrag), 0) * (1 + z(s.admin_reserve));

  const proObjekt = stundenJeObjekt(entries, employees, monat);
  const proPerson = stundenJePerson(entries, monat);
  const schwelleStd = z(s.nbu_schwelle) * 52 / 12;

  // Nur aktive Objekte zaehlen als Umsatz. Ein inaktives Objekt liefert in
  // diesem Monat keine Leistung, also darf sein Abo weder in den Umsatz noch
  // in die Verteilschluessel fuer Administration und Treibstoff einfliessen.
  const totalAbos = objektMonat.reduce((a, o) => a + (o.aktiv ? z(o.abo_betrag) : 0), 0);
  const aktiveObj = objektMonat.filter((o) => o.aktiv).length;

  const trsAnteil = (o) => {
    if (!z(s.trs_topf)) return 0;
    if (s.trs_schluessel === "objekt") return aktiveObj ? z(s.trs_topf) / aktiveObj : 0;
    return totalAbos ? z(s.trs_topf) * z(o.abo_betrag) / totalAbos : 0;
  };

  const obj = objektMonat.map((o) => {
    const erfasst = proObjekt.get(o.objekt_id);
    // Erfasste Stunden schlagen die Handeingabe.
    const ausErfassung = !!(erfasst && erfasst.std > 0);
    const std = ausErfassung ? erfasst.std : z(o.std_manuell);
    const loehne = ausErfassung
      ? erfasst.lohnsumme
      : z(o.std_manuell) * z(o.lohn_manuell) * z(o.ma);

    const ahv = loehne * z(s.ahv);
    const alv = loehne * z(s.alv);

    // NBU nur, wenn die Firma sie uebernimmt. Nach Art. 91 UVG traegt
    // sie sonst der Arbeitnehmer und ist keine Arbeitgeberkost.
    let nbu = 0;
    if (s.nbu_traegt_ag) {
      if (ausErfassung) {
        // Schwelle pro Person pruefen, wie es das Gesetz vorsieht.
        let basis = 0;
        for (const pid of erfasst.personen) {
          if ((proPerson.get(pid) || 0) >= schwelleStd) {
            const anteil = entries
              .filter((e) => e.type === "arbeit" && e.objekt_id === o.objekt_id &&
                             e.employee_id === pid && e.date.startsWith(monat.slice(0, 7)))
              .reduce((a, e) => a + z(e.value), 0);
            const satz = z((employees.find((x) => x.id === pid) || {}).stundenlohn);
            basis += anteil * satz;
          }
        }
        nbu = basis * z(s.nbu);
      } else {
        nbu = std >= schwelleStd ? loehne * z(s.nbu) : 0;
      }
    }

    const bu = loehne * z(s.bu);
    const ktg = loehne * z(s.ktg_objekt);
    const rpk = loehne * z(s.rpk);
    const lohnSz = o.aktiv ? loehne + ahv + alv + nbu + bu + ktg + rpk : 0;
    // Inaktiv heisst: weder Ertrag noch Kosten. Wuerde hier das Abo stehen
    // bleiben, waehrend die Loehne wegfallen, ergaebe das Objekt einen
    // Gewinn in voller Abohoehe aus dem Nichts.
    const abo = o.aktiv ? z(o.abo_betrag) : 0;
    const zt = abo - lohnSz;
    const mat = o.aktiv ? z(s.mat) : 0;
    const mas = o.aktiv ? z(s.mas) : 0;
    const trs = o.aktiv ? z(s.trs) + trsAnteil(o) : 0;
    const admin = totalAbos ? adminTopf * abo / totalAbos : 0;
    const gew = std === 0 ? 0 : zt - mat - mas - trs - admin;

    return { o, abo, ausErfassung, personen: erfasst ? erfasst.personen.size : 0,
             ohneLohn: erfasst ? erfasst.ohneLohn.size : 0,
             std, loehne, ahv, alv, nbu, bu, ktg, rpk, lohnSz, zt, mat, mas, trs, admin, gew };
  });

  const staff = personMonat.map((p) => {
    const lohn = z(p.lohn);
    const ml13 = p.ml13 ? lohn * z(s.ml13) : 0;
    const ahv = p.abzug_ahv ? lohn * z(s.ahv) : 0;
    const alv = p.abzug_alv ? lohn * z(s.alv) : 0;
    const bu = lohn * z(s.bu);
    const ktg = lohn * z(s.ktg_personal);
    const rpk = p.abzug_rpk ? lohn * z(s.rpk) : 0;
    // NBU auch hier nur, wenn die Firma sie traegt.
    const nbu = s.nbu_traegt_ag ? lohn * z(s.nbu) : 0;
    const fak = p.fak_manuell !== null && p.fak_manuell !== undefined && p.fak_manuell !== ""
      ? z(Number(p.fak_manuell))
      : (p.abzug_fak && p.abzug_ahv ? lohn * z(s.fak) : 0);
    const bvg = p.bvg_manuell !== null && p.bvg_manuell !== undefined && p.bvg_manuell !== ""
      ? z(Number(p.bvg_manuell))
      : (p.bvg ? bvgAuto(lohn, s) : 0);
    const lohnSz = lohn + z(p.spesen) + ml13 + ahv + alv + nbu + bu + ktg + rpk + fak + bvg;
    return { p, lohn, ml13, ahv, alv, nbu, bu, ktg, rpk, fak, bvg, lohnSz };
  });

  const sumO = (k) => obj.reduce((a, r) => a + r[k], 0);
  const sumP = (k) => staff.reduce((a, r) => a + r[k], 0);

  const t = {
    abos: totalAbos,
    loehne: obj.reduce((a, r) => a + (r.o.aktiv ? r.loehne : 0), 0) + sumP("lohn"),
    spesen: staff.reduce((a, r) => a + z(r.p.spesen), 0),
    ml13: sumP("ml13"),
    ahv: sumO("ahv") + sumP("ahv"),
    alv: sumO("alv") + sumP("alv"),
    nbu: sumO("nbu") + sumP("nbu"),
    bu: sumO("bu") + sumP("bu"),
    ktg: sumO("ktg") + sumP("ktg"),
    rpk: sumO("rpk") + sumP("rpk"),
    fak: sumP("fak"),
    bvg: sumP("bvg"),
    lohnSzAlle: sumO("lohnSz") + sumP("lohnSz"),
    lohnSzObj: sumO("lohnSz"),
    lohnSzPers: sumP("lohnSz"),
    mat: sumO("mat"), mas: sumO("mas"), trs: sumO("trs"),
    admin: adminTopf,
    gew: sumO("gew"),
    stdTotal: obj.reduce((a, r) => a + (r.o.aktiv ? r.std : 0), 0),
    maTotal: objektMonat.reduce((a, o) => a + (o.aktiv ? z(o.ma) : 0), 0),
    ausErfassung: obj.filter((r) => r.ausErfassung).length,
    ohneLohnsatz: obj.reduce((a, r) => a + r.ohneLohn, 0),
  };
  t.zt = t.abos - t.lohnSzAlle;

  const ohneStd = obj.filter((r) => r.std === 0).length;
  const abosOhneGew = obj.filter((r) => r.std === 0).reduce((a, r) => a + r.abo, 0);
  const ergebnis = t.abos - t.lohnSzObj - t.lohnSzPers - t.mat - t.mas - t.trs - t.admin;
  const beitragOhneStd = sumO("zt") - t.mat - t.mas - t.trs - t.admin - t.gew;

  return {
    obj, staff, t,
    res: {
      ergebnis,
      marge: t.abos ? ergebnis / t.abos : 0,
      gewProzent: t.abos - abosOhneGew ? t.gew / (t.abos - abosOhneGew) : 0,
      ohneStd, abosOhneGew, beitragOhneStd,
      adminTopf,
    },
  };
}

/* ---------- Formatierung ---------- */
const nf = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
export const chf = (v) => (!isFinite(v) || v === null ? "" : nf.format(v));
export const chf0 = (v) => nf0.format(v || 0);
export const pct = (v) => (!isFinite(v) ? "" : (v * 100).toFixed(1).replace(".", ",") + " %");
export const vorzeichen = (v) => (v < -0.005 ? "neg" : v > 0.005 ? "pos" : "");
export const monatName = (iso) => {
  const M = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const d = String(iso).split("-");
  return `${M[Number(d[1]) - 1]} ${d[0]}`;
};
