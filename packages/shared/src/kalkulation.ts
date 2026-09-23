/**
 * Rechenkern der Kalkulation.
 *
 * Portiert aus legacy/src/kalkulation.js, Zeile für Zeile und in
 * derselben Reihenfolge der Rechenschritte. Das ist kein Schönheitsfehler,
 * sondern Absicht: Gleitkommaaddition ist nicht assoziativ, (a+b)+c kann
 * sich vom a+(b+c) im letzten Rappen unterscheiden. Wer hier "aufräumt",
 * bekommt Abweichungen, die niemand erklären kann.
 *
 * Geprüft wird die Portierung durch einen Vergleichstest, der alten und
 * neuen Code mit tausenden zufälligen Szenarien füttert und auf
 * Gleichheit prüft (kalkulation.vergleich.test.ts).
 *
 * Reine Funktionen: kein React, keine Datenbank. Nur so lässt sich das
 * Ergebnis überhaupt gegenrechnen.
 */

/** Alles, was keine endliche Zahl ist, zählt als 0. */
export function z(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const zahl = Number(v);
    return Number.isFinite(zahl) ? zahl : 0;
  }
  return 0;
}

/** Zahlwert, der auch als Zeichenkette aus der Datenbank kommen darf. */
export type Zahl = number | string | null | undefined;

/** Eine Zeile aus kalk_monat: die Ansätze, die in diesem Monat galten. */
export type Ansaetze = {
  ahv: Zahl;
  alv: Zahl;
  nbu: Zahl;
  bu: Zahl;
  ktgObjekt: Zahl;
  ktgPersonal: Zahl;
  rpk: Zahl;
  fak: Zahl;
  ml13: Zahl;
  nbuSchwelle: Zahl;
  nbuTraegtAg: boolean;
  bvgSatz: Zahl;
  bvgEintritt: Zahl;
  bvgKoord: Zahl;
  bvgMin: Zahl;
  bvgMax: Zahl;
  mat: Zahl;
  mas: Zahl;
  trs: Zahl;
  trsTopf: Zahl;
  trsSchluessel: "abos" | "objekt";
  adminReserve: Zahl;
};

export type ObjektMonat = {
  objektId: string;
  aboBetrag: Zahl;
  stdManuell: Zahl;
  lohnManuell: Zahl;
  ma: Zahl;
  aktiv: boolean;
};

export type PersonMonat = {
  mitarbeiterId: string;
  lohn: Zahl;
  spesen: Zahl;
  ml13: boolean;
  abzugAhv: boolean;
  abzugAlv: boolean;
  abzugRpk: boolean;
  abzugFak: boolean;
  fakManuell: Zahl;
  bvg: boolean;
  bvgManuell: Zahl;
};

export type Adminposten = { position?: string; betrag: Zahl };

export type Eintrag = {
  mitarbeiterId: string;
  objektId: string | null;
  datum: string;
  art: string;
  wert: Zahl;
};

export type MitarbeiterSatz = { id: string; stundenlohn: Zahl };

/** BVG-Arbeitgeberbeitrag auf dem koordinierten Lohn, pro Monat. */
export function bvgAuto(lohn: Zahl, s: Ansaetze): number {
  const jahr = z(lohn) * 12;
  if (jahr < z(s.bvgEintritt)) return 0;
  return (Math.min(Math.max(jahr - z(s.bvgKoord), z(s.bvgMin)), z(s.bvgMax)) * z(s.bvgSatz)) / 12;
}

export type ObjektErfassung = {
  std: number;
  lohnsumme: number;
  personen: Set<string>;
  ohneLohn: Set<string>;
};

/**
 * Stunden und Lohnsumme je Objekt aus den erfassten Eintraegen.
 *
 * Ohne hinterlegten Stundenlohn zählt die Person zwar mit ihren Stunden,
 * steuert aber keinen Lohn bei. Das wird in der Ansicht als Warnung
 * sichtbar, statt still einen zu niedrigen Lohnaufwand zu melden.
 */
export function stundenJeObjekt(
  eintraege: Eintrag[],
  mitarbeiter: MitarbeiterSatz[],
  monat: string,
): Map<string, ObjektErfassung> {
  const lohnVon = new Map(mitarbeiter.map((m) => [m.id, z(m.stundenlohn)]));
  const map = new Map<string, ObjektErfassung>();

  for (const e of eintraege) {
    if (e.art !== "arbeit" || !e.objektId) continue;
    if (!e.datum.startsWith(monat.slice(0, 7))) continue;

    let r = map.get(e.objektId);
    if (!r) {
      r = { std: 0, lohnsumme: 0, personen: new Set(), ohneLohn: new Set() };
      map.set(e.objektId, r);
    }

    const std = z(e.wert);
    const satz = lohnVon.get(e.mitarbeiterId) || 0;
    r.std += std;
    r.lohnsumme += std * satz;
    r.personen.add(e.mitarbeiterId);
    if (!satz) r.ohneLohn.add(e.mitarbeiterId);
  }

  return map;
}

/** Stunden je Person im Monat, für die NBU-Schwelle. */
export function stundenJePerson(eintraege: Eintrag[], monat: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of eintraege) {
    if (e.art !== "arbeit") continue;
    if (!e.datum.startsWith(monat.slice(0, 7))) continue;
    map.set(e.mitarbeiterId, (map.get(e.mitarbeiterId) || 0) + z(e.wert));
  }
  return map;
}

export type ObjektErgebnis = {
  o: ObjektMonat;
  abo: number;
  ausErfassung: boolean;
  personen: number;
  ohneLohn: number;
  std: number;
  loehne: number;
  ahv: number;
  alv: number;
  nbu: number;
  bu: number;
  ktg: number;
  rpk: number;
  lohnSz: number;
  zt: number;
  mat: number;
  mas: number;
  trs: number;
  admin: number;
  gew: number;
};

export type PersonErgebnis = {
  p: PersonMonat;
  lohn: number;
  ml13: number;
  ahv: number;
  alv: number;
  nbu: number;
  bu: number;
  ktg: number;
  rpk: number;
  fak: number;
  bvg: number;
  lohnSz: number;
};

export type Kalkulationsergebnis = {
  obj: ObjektErgebnis[];
  staff: PersonErgebnis[];
  t: Record<string, number>;
  res: {
    ergebnis: number;
    marge: number;
    gewProzent: number;
    ohneStd: number;
    abosOhneGew: number;
    beitragOhneStd: number;
    adminTopf: number;
  };
};

export function rechne(eingabe: {
  monat: string;
  s: Ansaetze;
  objektMonat: ObjektMonat[];
  personMonat: PersonMonat[];
  adminkosten: Adminposten[];
  eintraege?: Eintrag[];
  mitarbeiter?: MitarbeiterSatz[];
}): Kalkulationsergebnis {
  const { monat, s, objektMonat, personMonat, adminkosten } = eingabe;
  const eintraege = eingabe.eintraege ?? [];
  const mitarbeiter = eingabe.mitarbeiter ?? [];

  const adminTopf = adminkosten.reduce((a, p) => a + z(p.betrag), 0) * (1 + z(s.adminReserve));

  const proObjekt = stundenJeObjekt(eintraege, mitarbeiter, monat);
  const proPerson = stundenJePerson(eintraege, monat);
  const schwelleStd = (z(s.nbuSchwelle) * 52) / 12;

  // Nur aktive Objekte zählen als Umsatz. Ein inaktives Objekt liefert in
  // diesem Monat keine Leistung, also darf sein Abo weder in den Umsatz
  // noch in die Verteilschlüssel einfliessen.
  const totalAbos = objektMonat.reduce((a, o) => a + (o.aktiv ? z(o.aboBetrag) : 0), 0);
  const aktiveObj = objektMonat.filter((o) => o.aktiv).length;

  const trsAnteil = (o: ObjektMonat): number => {
    if (!z(s.trsTopf)) return 0;
    if (s.trsSchluessel === "objekt") return aktiveObj ? z(s.trsTopf) / aktiveObj : 0;
    return totalAbos ? (z(s.trsTopf) * z(o.aboBetrag)) / totalAbos : 0;
  };

  const obj: ObjektErgebnis[] = objektMonat.map((o) => {
    const erfasst = proObjekt.get(o.objektId);
    // Erfasste Stunden schlagen die Handeingabe.
    const ausErfassung = !!(erfasst && erfasst.std > 0);
    const std = ausErfassung ? erfasst!.std : z(o.stdManuell);
    const loehne = ausErfassung ? erfasst!.lohnsumme : z(o.stdManuell) * z(o.lohnManuell) * z(o.ma);

    const ahv = loehne * z(s.ahv);
    const alv = loehne * z(s.alv);

    // NBU nur, wenn die Firma sie uebernimmt. Nach Art. 91 UVG trägt sie
    // sonst der Arbeitnehmer und ist keine Arbeitgeberkost.
    let nbu = 0;
    if (s.nbuTraegtAg) {
      if (ausErfassung) {
        // Schwelle pro Person prüfen, wie es das Gesetz vorsieht.
        let basis = 0;
        for (const pid of erfasst!.personen) {
          if ((proPerson.get(pid) || 0) >= schwelleStd) {
            const anteil = eintraege
              .filter(
                (e) =>
                  e.art === "arbeit" &&
                  e.objektId === o.objektId &&
                  e.mitarbeiterId === pid &&
                  e.datum.startsWith(monat.slice(0, 7)),
              )
              .reduce((a, e) => a + z(e.wert), 0);
            const satz = z(mitarbeiter.find((x) => x.id === pid)?.stundenlohn);
            basis += anteil * satz;
          }
        }
        nbu = basis * z(s.nbu);
      } else {
        nbu = std >= schwelleStd ? loehne * z(s.nbu) : 0;
      }
    }

    const bu = loehne * z(s.bu);
    const ktg = loehne * z(s.ktgObjekt);
    const rpk = loehne * z(s.rpk);
    const lohnSz = o.aktiv ? loehne + ahv + alv + nbu + bu + ktg + rpk : 0;
    // Inaktiv heisst: weder Ertrag noch Kosten. Bliebe hier das Abo stehen,
    // während die Löhne wegfallen, ergäbe das Objekt einen Gewinn in
    // voller Abohöhe aus dem Nichts.
    const abo = o.aktiv ? z(o.aboBetrag) : 0;
    const zt = abo - lohnSz;
    const mat = o.aktiv ? z(s.mat) : 0;
    const mas = o.aktiv ? z(s.mas) : 0;
    const trs = o.aktiv ? z(s.trs) + trsAnteil(o) : 0;
    const admin = totalAbos ? (adminTopf * abo) / totalAbos : 0;
    const gew = std === 0 ? 0 : zt - mat - mas - trs - admin;

    return {
      o,
      abo,
      ausErfassung,
      personen: erfasst ? erfasst.personen.size : 0,
      ohneLohn: erfasst ? erfasst.ohneLohn.size : 0,
      std,
      loehne,
      ahv,
      alv,
      nbu,
      bu,
      ktg,
      rpk,
      lohnSz,
      zt,
      mat,
      mas,
      trs,
      admin,
      gew,
    };
  });

  const staff: PersonErgebnis[] = personMonat.map((p) => {
    const lohn = z(p.lohn);
    const ml13 = p.ml13 ? lohn * z(s.ml13) : 0;
    const ahv = p.abzugAhv ? lohn * z(s.ahv) : 0;
    const alv = p.abzugAlv ? lohn * z(s.alv) : 0;
    const bu = lohn * z(s.bu);
    const ktg = lohn * z(s.ktgPersonal);
    const rpk = p.abzugRpk ? lohn * z(s.rpk) : 0;
    // NBU auch hier nur, wenn die Firma sie traegt.
    const nbu = s.nbuTraegtAg ? lohn * z(s.nbu) : 0;

    const fak =
      p.fakManuell !== null && p.fakManuell !== undefined && p.fakManuell !== ""
        ? z(Number(p.fakManuell))
        : p.abzugFak && p.abzugAhv
          ? lohn * z(s.fak)
          : 0;

    const bvg =
      p.bvgManuell !== null && p.bvgManuell !== undefined && p.bvgManuell !== ""
        ? z(Number(p.bvgManuell))
        : p.bvg
          ? bvgAuto(lohn, s)
          : 0;

    const lohnSz = lohn + z(p.spesen) + ml13 + ahv + alv + nbu + bu + ktg + rpk + fak + bvg;
    return { p, lohn, ml13, ahv, alv, nbu, bu, ktg, rpk, fak, bvg, lohnSz };
  });

  const sumO = (k: keyof ObjektErgebnis) => obj.reduce((a, r) => a + (r[k] as number), 0);
  const sumP = (k: keyof PersonErgebnis) => staff.reduce((a, r) => a + (r[k] as number), 0);

  const t: Record<string, number> = {
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
    mat: sumO("mat"),
    mas: sumO("mas"),
    trs: sumO("trs"),
    admin: adminTopf,
    gew: sumO("gew"),
    stdTotal: obj.reduce((a, r) => a + (r.o.aktiv ? r.std : 0), 0),
    maTotal: objektMonat.reduce((a, o) => a + (o.aktiv ? z(o.ma) : 0), 0),
    ausErfassung: obj.filter((r) => r.ausErfassung).length,
    ohneLohnsatz: obj.reduce((a, r) => a + r.ohneLohn, 0),
  };
  t.zt = t.abos! - t.lohnSzAlle!;

  const ohneStd = obj.filter((r) => r.std === 0).length;
  const abosOhneGew = obj.filter((r) => r.std === 0).reduce((a, r) => a + r.abo, 0);
  const ergebnis = t.abos! - t.lohnSzObj! - t.lohnSzPers! - t.mat! - t.mas! - t.trs! - t.admin!;
  const beitragOhneStd = sumO("zt") - t.mat! - t.mas! - t.trs! - t.admin! - t.gew!;

  return {
    obj,
    staff,
    t,
    res: {
      ergebnis,
      marge: t.abos ? ergebnis / t.abos! : 0,
      gewProzent: t.abos! - abosOhneGew ? t.gew! / (t.abos! - abosOhneGew) : 0,
      ohneStd,
      abosOhneGew,
      beitragOhneStd,
      adminTopf,
    },
  };
}

/* ---------- Formatierung ---------- */

const nf = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });

export const chf = (v: number | null): string =>
  v === null || !Number.isFinite(v) ? "" : nf.format(v);
export const chf0 = (v: number): string => nf0.format(v || 0);
export const pct = (v: number): string =>
  !Number.isFinite(v) ? "" : (v * 100).toFixed(1).replace(".", ",") + " %";
export const vorzeichen = (v: number): string => (v < -0.005 ? "neg" : v > 0.005 ? "pos" : "");

export const monatName = (iso: string): string => {
  const M = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ];
  const d = String(iso).split("-");
  return `${M[Number(d[1]) - 1]} ${d[0]}`;
};
