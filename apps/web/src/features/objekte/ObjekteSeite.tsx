/**
 * Objekte: die Standorte, auf die Stunden gebucht werden.
 * Gleicher Aufbau wie die Mitarbeiterseite, nur ohne Lohnfelder.
 */
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { hatRecht } from "@dels/shared";
import { ApiFehler, api } from "../../api/client.js";
import { useAuth } from "../../app/AuthKontext.js";
import { useListe } from "../../app/useListe.js";
import { Feld, Feldgruppe, Kontrollkaestchen } from "../../components/Feld.js";

export type Objekt = {
  id: string;
  name: string;
  objektNr: string | null;
  kunde: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  aboBetrag: string | null;
  aktiv: boolean;
  notizen: string | null;
};

const LEER = {
  name: "",
  objektNr: "",
  kunde: "",
  strasse: "",
  plz: "",
  ort: "",
  aboBetrag: "",
  aktiv: true,
  notizen: "",
};

type Formularwerte = typeof LEER;

export function ObjekteSeite() {
  const { benutzer } = useAuth();
  const { daten, laedt, fehler, neuLaden } = useListe<Objekt>("/objekte");
  const [suche, setSuche] = useState("");
  const [nurAktive, setNurAktive] = useState(true);
  const [auswahl, setAuswahl] = useState<Objekt | "neu" | null>(null);

  const darfSchreiben = benutzer ? hatRecht(benutzer.rolle, "stammdaten:schreiben") : false;

  const gefiltert = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    return daten
      .filter((o) => (nurAktive ? o.aktiv : true))
      .filter(
        (o) =>
          begriff === "" ||
          o.name.toLowerCase().includes(begriff) ||
          (o.objektNr ?? "").toLowerCase().includes(begriff) ||
          (o.kunde ?? "").toLowerCase().includes(begriff) ||
          (o.ort ?? "").toLowerCase().includes(begriff),
      );
  }, [daten, suche, nurAktive]);

  const summeAbos = useMemo(
    () => gefiltert.reduce((summe, o) => summe + Number(o.aboBetrag ?? 0), 0),
    [gefiltert],
  );

  return (
    <div className="seitenraster">
      <section className="spalte-liste">
        <div className="seitenkopf">
          <h1>Objekte</h1>
          {darfSchreiben && (
            <button className="knopf" onClick={() => setAuswahl("neu")}>
              Neu
            </button>
          )}
        </div>

        <div className="filterzeile">
          <input
            type="search"
            placeholder="Suchen: Name, Nummer, Kunde, Ort"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            aria-label="Objekte suchen"
          />
          <label className="schalter">
            <input
              type="checkbox"
              checked={nurAktive}
              onChange={(e) => setNurAktive(e.target.checked)}
            />
            nur aktive
          </label>
        </div>

        {fehler && <p className="status status-rot">{fehler}</p>}
        {laedt && <p className="hinweis">Wird geladen ...</p>}

        {!laedt && gefiltert.length === 0 && (
          <p className="hinweis">
            {daten.length === 0 ? "Noch keine Objekte erfasst." : "Nichts gefunden."}
          </p>
        )}

        {gefiltert.length > 0 && (
          <>
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Name</th>
                  <th>Ort</th>
                  <th className="rechts">Abo/Monat</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((o) => (
                  <tr
                    key={o.id}
                    className={
                      (auswahl !== "neu" && auswahl?.id === o.id ? "gewaehlt " : "") +
                      (o.aktiv ? "" : "inaktiv")
                    }
                    onClick={() => setAuswahl(o)}
                  >
                    <td>{o.objektNr ?? ""}</td>
                    <td>
                      {o.name}
                      {!o.aktiv && <span className="schild">inaktiv</span>}
                    </td>
                    <td>{o.ort ?? ""}</td>
                    <td className="rechts">{o.aboBetrag ?? ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{gefiltert.length} Objekte</td>
                  <td className="rechts">
                    {summeAbos.toLocaleString("de-CH", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </section>

      <section className="spalte-formular">
        {auswahl ? (
          <ObjektFormular
            key={auswahl === "neu" ? "neu" : auswahl.id}
            vorhanden={auswahl === "neu" ? null : auswahl}
            darfSchreiben={darfSchreiben}
            onFertig={() => {
              setAuswahl(null);
              neuLaden();
            }}
            onAbbrechen={() => setAuswahl(null)}
          />
        ) : (
          <p className="hinweis">Ein Objekt auswählen oder oben auf Neu klicken.</p>
        )}
      </section>
    </div>
  );
}

function ObjektFormular({
  vorhanden,
  darfSchreiben,
  onFertig,
  onAbbrechen,
}: {
  vorhanden: Objekt | null;
  darfSchreiben: boolean;
  onFertig: () => void;
  onAbbrechen: () => void;
}) {
  const [werte, setWerte] = useState<Formularwerte>(() => {
    if (!vorhanden) return { ...LEER };
    return {
      name: vorhanden.name,
      objektNr: vorhanden.objektNr ?? "",
      kunde: vorhanden.kunde ?? "",
      strasse: vorhanden.strasse ?? "",
      plz: vorhanden.plz ?? "",
      ort: vorhanden.ort ?? "",
      aboBetrag: vorhanden.aboBetrag ?? "",
      aktiv: vorhanden.aktiv,
      notizen: vorhanden.notizen ?? "",
    };
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldfehler, setFeldfehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);

  function setze<K extends keyof Formularwerte>(feld: K, wert: Formularwerte[K]) {
    setWerte((alt) => ({ ...alt, [feld]: wert }));
  }

  async function speichern(ereignis: FormEvent) {
    ereignis.preventDefault();
    setFehler(null);
    setFeldfehler({});
    setLaeuft(true);

    try {
      if (vorhanden) {
        await api.patch(`/objekte/${vorhanden.id}`, werte);
      } else {
        await api.post("/objekte", werte);
      }
      onFertig();
    } catch (e: unknown) {
      if (e instanceof ApiFehler) {
        setFehler(e.message);
        setFeldfehler(Object.fromEntries(e.felder.map((f) => [f.feld, f.problem])));
      } else {
        setFehler("Speichern fehlgeschlagen.");
      }
    } finally {
      setLaeuft(false);
    }
  }

  async function loeschen() {
    if (!vorhanden) return;
    setFehler(null);
    try {
      await api.delete(`/objekte/${vorhanden.id}`);
      onFertig();
    } catch (e: unknown) {
      // Der haeufige Fall: es haengen Stunden dran. Die Meldung vom
      // Server sagt, was stattdessen zu tun ist.
      setFehler(e instanceof ApiFehler ? e.message : "Löschen fehlgeschlagen.");
    }
  }

  return (
    <form className="formular" onSubmit={speichern} noValidate>
      <h2>{vorhanden ? vorhanden.name : "Neues Objekt"}</h2>

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}

      <Feldgruppe titel="Objekt">
        <Feld
          id="o-name"
          beschriftung="Name"
          wert={werte.name}
          onChange={(w) => setze("name", w)}
          fehler={feldfehler.name}
          breit
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="o-nr"
          beschriftung="Objektnummer"
          wert={werte.objektNr}
          onChange={(w) => setze("objektNr", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="o-kunde"
          beschriftung="Kunde"
          wert={werte.kunde}
          onChange={(w) => setze("kunde", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="o-strasse"
          beschriftung="Strasse"
          wert={werte.strasse}
          onChange={(w) => setze("strasse", w)}
          breit
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="o-plz"
          beschriftung="PLZ"
          wert={werte.plz}
          onChange={(w) => setze("plz", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="o-ort"
          beschriftung="Ort"
          wert={werte.ort}
          onChange={(w) => setze("ort", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="o-abo"
          beschriftung="Abo pro Monat (CHF)"
          wert={werte.aboBetrag}
          onChange={(w) => setze("aboBetrag", w)}
          fehler={feldfehler.aboBetrag}
          deaktiviert={!darfSchreiben}
        />
        <Kontrollkaestchen
          id="o-aktiv"
          beschriftung="Aktiv"
          wert={werte.aktiv}
          onChange={(w) => setze("aktiv", w)}
        />
      </Feldgruppe>

      <div className="formularfuss">
        <button type="button" className="knopf-leise" onClick={onAbbrechen}>
          Schliessen
        </button>
        {darfSchreiben && vorhanden && (
          <button type="button" className="knopf-gefahr" onClick={() => void loeschen()}>
            Loeschen
          </button>
        )}
        {darfSchreiben && (
          <button type="submit" className="knopf" disabled={laeuft}>
            {laeuft ? "Speichert ..." : "Speichern"}
          </button>
        )}
      </div>
    </form>
  );
}
