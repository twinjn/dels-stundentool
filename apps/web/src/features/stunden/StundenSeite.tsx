/**
 * Stundenerfassung im Layout des gewohnten Monatsblatts.
 *
 * Eine Zeile je Person, darunter je eine Zeile pro Objekt, die Tage als
 * Spalten. Getippt wird wie in Excel: eine Zahl sind Stunden, ein
 * Buchstabe ist eine Abwesenheit (F, K, U, S auf der Personenzeile,
 * Fr auf einer Objektzeile).
 *
 * WARUM NICHT 4000 EINGABEFELDER: 45 Personen mal 31 Tage mal mehrere
 * Objektzeilen ergeben schnell ein paar tausend Zellen. So viele echte
 * <input> wuerde der Browser spuerbar langsam darstellen, und langsam ist
 * genau das, was am bisherigen Excel stoert. Deshalb sind die Zellen
 * einfacher Text, und nur die Zelle, in der gerade jemand tippt, bekommt
 * ein Eingabefeld.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KUERZEL, hatRecht, zeigeZelle } from "@dels/shared";
import type { Eintragsart } from "@dels/shared";
import { ApiFehler, api } from "../../api/client.js";
import { useAuth } from "../../app/AuthKontext.js";
import type { Monatsraster, ObjektAuswahl, Personenzeile, Rasterzeile } from "./typen.js";
import { zeilenFlachLegen } from "./typen.js";

const MONATSNAMEN = [
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

function heutigerMonat(): string {
  const jetzt = new Date();
  return `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}`;
}

function monatVerschieben(monat: string, schritte: number): string {
  const [jahr, nr] = monat.split("-").map(Number) as [number, number];
  const gesamt = jahr * 12 + (nr - 1) + schritte;
  return `${Math.floor(gesamt / 12)}-${String((gesamt % 12) + 1).padStart(2, "0")}`;
}

function monatText(monat: string): string {
  const [jahr, nr] = monat.split("-").map(Number) as [number, number];
  return `${MONATSNAMEN[nr - 1]} ${jahr}`;
}

type AktiveZelle = { zeile: number; datum: string };

export function StundenSeite() {
  const { benutzer } = useAuth();
  const darfSchreiben = benutzer ? hatRecht(benutzer.rolle, "stunden:schreiben") : false;

  const [monat, setMonat] = useState(heutigerMonat);
  const [raster, setRaster] = useState<Monatsraster | null>(null);
  const [objektauswahl, setObjektauswahl] = useState<ObjektAuswahl[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  /** Objektzeilen, die jemand hinzugefuegt hat, aber noch leer sind. */
  const [zusatzzeilen, setZusatzzeilen] = useState<Record<string, string[]>>({});
  const [aktiv, setAktiv] = useState<AktiveZelle | null>(null);
  const [entwurf, setEntwurf] = useState("");
  const [suche, setSuche] = useState("");
  const [nurMitErfassung, setNurMitErfassung] = useState(false);

  const laden = useCallback(async (welcherMonat: string) => {
    setLaedt(true);
    setFehler(null);
    try {
      const daten = await api.get<Monatsraster>(`/stunden?monat=${welcherMonat}`);
      setRaster(daten);
      setZusatzzeilen({});
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Laden fehlgeschlagen.");
      setRaster(null);
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    void laden(monat);
  }, [monat, laden]);

  useEffect(() => {
    api
      .get<ObjektAuswahl[]>("/stunden/objekte")
      .then(setObjektauswahl)
      .catch(() => setObjektauswahl([]));
  }, []);

  /**
   * Gefiltert wird im Browser, nicht auf dem Server: ein Monat sind ein
   * paar hundert Zeilen, die sind laengst geladen. Beim Tippen im
   * Suchfeld nochmal zu laden waere nur langsamer.
   */
  const sichtbare = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    return (raster?.mitarbeiter ?? [])
      .filter((p) => {
        if (!nurMitErfassung) return true;
        const hatEtwas =
          Object.keys(p.abwesenheiten).length > 0 ||
          p.objekte.some((o) => Object.keys(o.tage).length > 0) ||
          (zusatzzeilen[p.id]?.length ?? 0) > 0;
        return hatEtwas;
      })
      .filter(
        (p) =>
          begriff === "" ||
          p.name.toLowerCase().includes(begriff) ||
          (p.personalnummer ?? "").toLowerCase().includes(begriff),
      );
  }, [raster, suche, nurMitErfassung, zusatzzeilen]);

  // Die Tastaturnavigation zaehlt nur die Zeilen, die man auch sieht.
  const zeilen = useMemo(
    () => zeilenFlachLegen(sichtbare, zusatzzeilen),
    [sichtbare, zusatzzeilen],
  );

  const personNachId = useMemo(() => {
    const karte = new Map<string, Personenzeile>();
    for (const p of raster?.mitarbeiter ?? []) karte.set(p.id, p);
    return karte;
  }, [raster]);

  function inhaltVon(zeile: Rasterzeile, datum: string): string {
    const person = personNachId.get(zeile.personId);
    if (!person) return "";

    if (zeile.art === "person") {
      const art = person.abwesenheiten[datum];
      return art ? KUERZEL[art] : "";
    }

    const objekt = person.objekte.find((o) => o.objektId === zeile.objektId);
    const zelle = objekt?.tage[datum];
    return zelle ? zeigeZelle(zelle.art, zelle.wert) : "";
  }

  async function speichern(zeile: Rasterzeile, datum: string, eingabe: string) {
    const vorher = inhaltVon(zeile, datum);
    if (eingabe.trim() === vorher) return;

    setSpeichert(true);
    setFehler(null);
    try {
      const antwort = await api.put<{ zelle: { art: Eintragsart; wert: string } | null }>(
        "/stunden/zelle",
        {
          mitarbeiterId: zeile.personId,
          objektId: zeile.art === "objekt" ? zeile.objektId : null,
          datum,
          eingabe,
        },
      );
      uebernehmen(zeile, datum, antwort.zelle);
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSpeichert(false);
    }
  }

  /** Aktualisiert das Raster im Browser, ohne alles neu zu laden. */
  function uebernehmen(
    zeile: Rasterzeile,
    datum: string,
    zelle: { art: Eintragsart; wert: string } | null,
  ) {
    setRaster((alt) => {
      if (!alt) return alt;

      const mitarbeiter = alt.mitarbeiter.map((person) => {
        if (person.id !== zeile.personId) return person;

        if (zeile.art === "person") {
          const abwesenheiten = { ...person.abwesenheiten };
          if (zelle) abwesenheiten[datum] = zelle.art;
          else delete abwesenheiten[datum];
          return { ...person, abwesenheiten, summen: summenNeu(person, abwesenheiten) };
        }

        const vorhanden = person.objekte.some((o) => o.objektId === zeile.objektId);
        const objekte = vorhanden
          ? person.objekte.map((o) => {
              if (o.objektId !== zeile.objektId) return o;
              const tage = { ...o.tage };
              if (zelle) tage[datum] = zelle;
              else delete tage[datum];
              return { ...o, tage };
            })
          : [
              ...person.objekte,
              {
                objektId: zeile.objektId,
                objektNr: objektauswahl.find((o) => o.id === zeile.objektId)?.objektNr ?? null,
                name: objektauswahl.find((o) => o.id === zeile.objektId)?.name ?? "Objekt",
                tage: zelle ? { [datum]: zelle } : {},
              },
            ];

        const erneuert = { ...person, objekte };
        return { ...erneuert, summen: summenNeu(erneuert, erneuert.abwesenheiten) };
      });

      return { ...alt, mitarbeiter };
    });
  }

  function summenNeu(person: Personenzeile, abwesenheiten: Record<string, Eintragsart>) {
    const summen = { arbeit: 0, ferien: 0, krankheit: 0, unfall: 0, feiertag: 0, sonstiges: 0 };
    for (const art of Object.values(abwesenheiten)) {
      if (art in summen) summen[art as keyof typeof summen] += 1;
    }
    for (const objekt of person.objekte) {
      for (const zelle of Object.values(objekt.tage)) {
        if (zelle.art in summen) summen[zelle.art as keyof typeof summen] += Number(zelle.wert);
      }
    }
    return summen;
  }

  function springe(
    vonZeile: number,
    datum: string,
    richtung: "runter" | "hoch" | "rechts" | "links",
  ) {
    if (!raster) return;
    const tage = raster.tage;
    const tagIndex = tage.findIndex((t) => t.datum === datum);

    if (richtung === "runter" || richtung === "hoch") {
      const ziel = vonZeile + (richtung === "runter" ? 1 : -1);
      if (ziel < 0 || ziel >= zeilen.length) return;
      setAktiv({ zeile: ziel, datum });
      setEntwurf(inhaltVon(zeilen[ziel]!, datum));
      return;
    }

    const zielTag = tagIndex + (richtung === "rechts" ? 1 : -1);
    if (zielTag < 0 || zielTag >= tage.length) return;
    setAktiv({ zeile: vonZeile, datum: tage[zielTag]!.datum });
    setEntwurf(inhaltVon(zeilen[vonZeile]!, tage[zielTag]!.datum));
  }

  const gesamtstunden = useMemo(
    () => (raster?.mitarbeiter ?? []).reduce((s, p) => s + p.summen.arbeit, 0),
    [raster],
  );

  return (
    <div className="stundenseite">
      <div className="seitenkopf">
        <div className="monatswahl">
          <button className="knopf-leise" onClick={() => setMonat(monatVerschieben(monat, -1))}>
            ‹
          </button>
          <h1>{monatText(monat)}</h1>
          <button className="knopf-leise" onClick={() => setMonat(monatVerschieben(monat, 1))}>
            ›
          </button>
          <button className="knopf-leise" onClick={() => setMonat(heutigerMonat())}>
            heute
          </button>
        </div>
        <div className="kopfhinweise">
          {speichert && <span className="hinweis">speichert ...</span>}
          <span className="hinweis">
            {gesamtstunden.toLocaleString("de-CH", { maximumFractionDigits: 1 })} Std. im Monat
          </span>
        </div>
      </div>

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}

      <div className="filterzeile">
        <input
          type="search"
          placeholder="Person suchen: Name oder Personalnummer"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          aria-label="Person suchen"
        />
        <label className="schalter">
          <input
            type="checkbox"
            checked={nurMitErfassung}
            onChange={(e) => setNurMitErfassung(e.target.checked)}
          />
          nur mit Erfassung
        </label>
        <span className="hinweis">
          {sichtbare.length} von {raster?.mitarbeiter.length ?? 0}
        </span>
      </div>

      <p className="hinweis legende">
        Tippen wie gewohnt: Zahl für Stunden (8.4 oder 8:24), <b>F</b> Ferien, <b>K</b> krank,{" "}
        <b>U</b> Unfall, <b>S</b> sonstiges auf der Namenszeile, <b>Fr</b> frei auf einer
        Objektzeile. Enter springt nach unten, Tab nach rechts.
      </p>

      {laedt && <p className="hinweis">Wird geladen ...</p>}

      {raster && !laedt && (
        <div className="rastercontainer">
          <table className="raster">
            <thead>
              <tr>
                <th className="haftend">Name / Objekt</th>
                {raster.tage.map((t) => (
                  <th key={t.datum} className={t.wochenende ? "wochenende" : ""}>
                    <span className="wochentag">{t.wochentag}</span>
                    <span className="tagnummer">{t.tag}</span>
                  </th>
                ))}
                <th className="summe">Arb.</th>
                <th className="summe">F</th>
                <th className="summe">K</th>
                <th className="summe">U</th>
              </tr>
            </thead>
            <tbody>
              {sichtbare.map((person) => (
                <PersonenBlock
                  key={person.id}
                  person={person}
                  tage={raster.tage}
                  zeilen={zeilen}
                  zusatz={zusatzzeilen[person.id] ?? []}
                  objektauswahl={objektauswahl}
                  aktiv={aktiv}
                  entwurf={entwurf}
                  darfSchreiben={darfSchreiben}
                  inhaltVon={inhaltVon}
                  onZelleWaehlen={(zeile, datum) => {
                    if (!darfSchreiben) return;
                    setAktiv({ zeile, datum });
                    setEntwurf(inhaltVon(zeilen[zeile]!, datum));
                  }}
                  onEntwurf={setEntwurf}
                  onSpeichern={speichern}
                  onSpringen={springe}
                  onAbbrechen={() => setAktiv(null)}
                  onObjektHinzufuegen={(objektId) =>
                    setZusatzzeilen((alt) => ({
                      ...alt,
                      [person.id]: [...(alt[person.id] ?? []), objektId],
                    }))
                  }
                />
              ))}
            </tbody>
          </table>
          {sichtbare.length === 0 && (
            <p className="hinweis leerhinweis">
              Niemand gefunden. Suche leeren oder den Filter ausschalten.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type BlockEigenschaften = {
  person: Personenzeile;
  tage: Monatsraster["tage"];
  zeilen: Rasterzeile[];
  zusatz: string[];
  objektauswahl: ObjektAuswahl[];
  aktiv: AktiveZelle | null;
  entwurf: string;
  darfSchreiben: boolean;
  inhaltVon: (zeile: Rasterzeile, datum: string) => string;
  onZelleWaehlen: (zeile: number, datum: string) => void;
  onEntwurf: (wert: string) => void;
  onSpeichern: (zeile: Rasterzeile, datum: string, eingabe: string) => Promise<void>;
  onSpringen: (
    zeile: number,
    datum: string,
    richtung: "runter" | "hoch" | "rechts" | "links",
  ) => void;
  onAbbrechen: () => void;
  onObjektHinzufuegen: (objektId: string) => void;
};

function PersonenBlock(e: BlockEigenschaften) {
  const meine = e.zeilen.filter((z) => z.personId === e.person.id);
  const personenzeile = meine.find((z) => z.art === "person")!;
  const objektzeilen = meine.filter((z) => z.art === "objekt");

  return (
    <>
      <tr className="personenzeile">
        <th className="haftend" scope="row">
          <span className="personname">{e.person.name}</span>
          {e.person.personalnummer && <span className="pernr">{e.person.personalnummer}</span>}
        </th>
        {e.tage.map((t) => (
          <ZellenFeld
            key={t.datum}
            zeile={personenzeile}
            datum={t.datum}
            wochenende={t.wochenende}
            {...e}
          />
        ))}
        <td className="summe">
          {e.person.summen.arbeit.toLocaleString("de-CH", { maximumFractionDigits: 1 })}
        </td>
        <td className="summe">{e.person.summen.ferien || ""}</td>
        <td className="summe">{e.person.summen.krankheit || ""}</td>
        <td className="summe">{e.person.summen.unfall || ""}</td>
      </tr>

      {objektzeilen.map((zeile) => {
        const objekt = e.person.objekte.find(
          (o) => zeile.art === "objekt" && o.objektId === zeile.objektId,
        );
        const ausAuswahl = e.objektauswahl.find(
          (o) => zeile.art === "objekt" && o.id === zeile.objektId,
        );
        const beschriftung = objekt ?? ausAuswahl;

        return (
          <tr key={zeile.nummer} className="objektzeile">
            <td className="haftend">
              <span className="objektnr">{beschriftung?.objektNr ?? ""}</span>
              <span className="objektname">{beschriftung?.name ?? "Objekt"}</span>
            </td>
            {e.tage.map((t) => (
              <ZellenFeld
                key={t.datum}
                zeile={zeile}
                datum={t.datum}
                wochenende={t.wochenende}
                {...e}
              />
            ))}
            <td className="summe" colSpan={4}></td>
          </tr>
        );
      })}

      {e.darfSchreiben && (
        <tr className="zufuegenzeile">
          <td className="haftend">
            <select
              value=""
              aria-label={`Objekt für ${e.person.name} hinzufügen`}
              onChange={(ereignis) => {
                if (ereignis.target.value) e.onObjektHinzufuegen(ereignis.target.value);
              }}
            >
              <option value="">+ Objekt ...</option>
              {e.objektauswahl.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.objektNr ? `${o.objektNr} ` : ""}
                  {o.name}
                </option>
              ))}
            </select>
          </td>
          <td colSpan={e.tage.length + 4}></td>
        </tr>
      )}
    </>
  );
}

function ZellenFeld({
  zeile,
  datum,
  wochenende,
  aktiv,
  entwurf,
  darfSchreiben,
  inhaltVon,
  onZelleWaehlen,
  onEntwurf,
  onSpeichern,
  onSpringen,
  onAbbrechen,
}: BlockEigenschaften & { zeile: Rasterzeile; datum: string; wochenende: boolean }) {
  const istAktiv = aktiv?.zeile === zeile.nummer && aktiv.datum === datum;
  const inhalt = inhaltVon(zeile, datum);
  const feld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (istAktiv) feld.current?.select();
  }, [istAktiv]);

  const klassen = [
    "zelle",
    wochenende ? "wochenende" : "",
    zeile.art === "person" ? "zelle-person" : "zelle-objekt",
    inhalt && zeile.art === "person" ? "zelle-abwesend" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!istAktiv) {
    return (
      <td
        className={klassen}
        tabIndex={darfSchreiben ? 0 : -1}
        onClick={() => onZelleWaehlen(zeile.nummer, datum)}
        onFocus={() => onZelleWaehlen(zeile.nummer, datum)}
      >
        {inhalt}
      </td>
    );
  }

  return (
    <td className={`${klassen} zelle-aktiv`}>
      <input
        ref={feld}
        value={entwurf}
        autoFocus
        onChange={(ereignis) => onEntwurf(ereignis.target.value)}
        onBlur={() => void onSpeichern(zeile, datum, entwurf)}
        onKeyDown={(ereignis) => {
          if (ereignis.key === "Enter") {
            ereignis.preventDefault();
            void onSpeichern(zeile, datum, entwurf).then(() =>
              onSpringen(zeile.nummer, datum, ereignis.shiftKey ? "hoch" : "runter"),
            );
          } else if (ereignis.key === "Tab") {
            ereignis.preventDefault();
            void onSpeichern(zeile, datum, entwurf).then(() =>
              onSpringen(zeile.nummer, datum, ereignis.shiftKey ? "links" : "rechts"),
            );
          } else if (ereignis.key === "Escape") {
            ereignis.preventDefault();
            onAbbrechen();
          }
        }}
      />
    </td>
  );
}
