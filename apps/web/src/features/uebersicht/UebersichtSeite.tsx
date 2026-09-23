/**
 * Jahresuebersicht: zwölf Monate je Person.
 *
 * Die Monatsansicht beantwortet "was war am 14. September". Diese hier
 * beantwortet "wie viele Ferientage hat jemand dieses Jahr schon bezogen"
 * und "in welchen Monaten war jemand krank". Zwei Fragen, zwei Ansichten,
 * dieselben Einträge.
 *
 * Umgeschaltet wird die Art, nicht die Tabelle: dieselbe Matrix zeigt
 * wahlweise Arbeitsstunden, Ferien-, Kranken- oder Unfalltage. Wer die
 * Formen vergleichen will, klickt hin und her, ohne die Augen neu
 * ausrichten zu müssen.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiFehler, api } from "../../api/client.js";
import { DruckKnopf, ExportKnopf } from "../../components/ExportKnopf.js";
import type { Art, Jahresuebersicht, Jahreszeile } from "./typen.js";

const MONATSKUERZEL = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

const ARTEN: { wert: Art; text: string; einheit: string }[] = [
  { wert: "arbeit", text: "Arbeit", einheit: "Std." },
  { wert: "ferien", text: "Ferien", einheit: "Tage" },
  { wert: "krankheit", text: "Krankheit", einheit: "Tage" },
  { wert: "unfall", text: "Unfall", einheit: "Tage" },
  { wert: "feiertag", text: "Feiertag", einheit: "Tage" },
  { wert: "sonstiges", text: "Sonstiges", einheit: "Tage" },
];

const zahl = (wert: number): string =>
  wert === 0 ? "" : wert.toLocaleString("de-CH", { maximumFractionDigits: 2 });

function heutigesJahr(): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date()).slice(0, 4),
  );
}

export function UebersichtSeite() {
  const [jahr, setJahr] = useState(heutigesJahr());
  const [art, setArt] = useState<Art>("arbeit");
  const [suche, setSuche] = useState("");
  const [alleZeigen, setAlleZeigen] = useState(false);
  const [daten, setDaten] = useState<Jahresuebersicht | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);

    api
      .get<Jahresuebersicht>(`/uebersicht?jahr=${jahr}&alle=${alleZeigen}`)
      .then((d) => {
        if (!abgebrochen) setDaten(d);
      })
      .catch((e: unknown) => {
        if (!abgebrochen) {
          setFehler(e instanceof ApiFehler ? e.message : "Die Übersicht konnte nicht laden.");
        }
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });

    return () => {
      abgebrochen = true;
    };
  }, [jahr, alleZeigen]);

  const sichtbare = useMemo(() => {
    const zeilen = daten?.mitarbeiter ?? [];
    const begriff = suche.trim().toLowerCase();
    if (!begriff) return zeilen;
    return zeilen.filter(
      (p) =>
        p.name.toLowerCase().includes(begriff) ||
        (p.personalnummer ?? "").toLowerCase().includes(begriff),
    );
  }, [daten, suche]);

  // Monatssummen über alle sichtbaren Zeilen, für die Fusszeile.
  const spaltensummen = useMemo(() => {
    const summen = Array.from({ length: 12 }, () => 0);
    let gesamt = 0;
    for (const person of sichtbare) {
      person.monate.forEach((m, i) => {
        summen[i]! += m[art];
      });
      gesamt += person.jahr[art];
    }
    return { summen, gesamt };
  }, [sichtbare, art]);

  const einheit = ARTEN.find((a) => a.wert === art)?.einheit ?? "";
  const zeigeFerien = art === "ferien";

  return (
    <div className="uebersichtseite">
      <div className="seitenkopf">
        <div className="monatswahl">
          <button className="knopf-leise" onClick={() => setJahr(jahr - 1)}>
            ‹
          </button>
          <h1>Jahr {jahr}</h1>
          <button className="knopf-leise" onClick={() => setJahr(jahr + 1)}>
            ›
          </button>
          <button className="knopf-leise" onClick={() => setJahr(heutigesJahr())}>
            heute
          </button>
        </div>
        <div className="kopfhinweise">
          <ExportKnopf
            pfad={`/export/uebersicht?jahr=${jahr}&alle=${alleZeigen}`}
            titel={`Die Jahresübersicht ${jahr} als Excel-Datei`}
          />
          <DruckKnopf />
        </div>
      </div>

      <div className="artwahl" role="tablist" aria-label="Eintragsart">
        {ARTEN.map((a) => (
          <button
            key={a.wert}
            type="button"
            role="tab"
            aria-selected={art === a.wert}
            className={art === a.wert ? "artknopf aktiv" : "artknopf"}
            onClick={() => setArt(a.wert)}
          >
            {a.text}
          </button>
        ))}
      </div>

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
            checked={alleZeigen}
            onChange={(e) => setAlleZeigen(e.target.checked)}
          />
          auch Ausgetretene
        </label>
        <span className="hinweis">
          {sichtbare.length} von {daten?.mitarbeiter.length ?? 0} · Werte in {einheit}
        </span>
      </div>

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}

      {laedt && !daten && <p className="hinweis">Wird geladen ...</p>}

      {daten && (
        <div className="rastercontainer">
          <table className="raster jahresraster">
            <thead>
              <tr>
                <th className="haftend">Name</th>
                {MONATSKUERZEL.map((m) => (
                  <th key={m}>{m}</th>
                ))}
                <th className="summe">Total</th>
                {zeigeFerien && <th className="summe">Anspruch</th>}
                {zeigeFerien && <th className="summe">Differenz</th>}
              </tr>
            </thead>
            <tbody>
              {sichtbare.map((person) => (
                <Zeile key={person.id} person={person} art={art} zeigeFerien={zeigeFerien} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="haftend">Alle sichtbaren</th>
                {spaltensummen.summen.map((s, i) => (
                  <th key={MONATSKUERZEL[i]}>{zahl(s)}</th>
                ))}
                <th className="summe">{zahl(spaltensummen.gesamt)}</th>
                {zeigeFerien && <th className="summe" />}
                {zeigeFerien && <th className="summe" />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {zeigeFerien && (
        <p className="hinweis legende">
          <b>Differenz</b> ist Anspruch minus bezogen, keine Saldoberechnung. Übertrag aus dem
          Vorjahr, anteiliger Anspruch bei Ein- oder Austritt und Halbtage sind nicht
          berücksichtigt. Der aus dem Excel übernommene Saldo steht beim Mitarbeiter.
        </p>
      )}
    </div>
  );
}

function Zeile({
  person,
  art,
  zeigeFerien,
}: {
  person: Jahreszeile;
  art: Art;
  zeigeFerien: boolean;
}) {
  const differenz = person.ferienanspruch - person.jahr.ferien;

  return (
    <tr className="personenzeile">
      <td className="haftend">
        {person.name}
        {person.personalnummer && <span className="pernr">{person.personalnummer}</span>}
        {!person.aktiv && <span className="pernr">ausgetreten</span>}
      </td>
      {person.monate.map((m, i) => (
        <td key={MONATSKUERZEL[i]} className="zelle">
          {zahl(m[art])}
        </td>
      ))}
      <td className="summe">{zahl(person.jahr[art])}</td>
      {zeigeFerien && <td className="summe">{zahl(person.ferienanspruch)}</td>}
      {zeigeFerien && (
        <td className={differenz < 0 ? "summe neg" : "summe"}>
          {differenz.toLocaleString("de-CH", { maximumFractionDigits: 2 })}
        </td>
      )}
    </tr>
  );
}
