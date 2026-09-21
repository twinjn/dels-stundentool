/**
 * Aenderungsprotokoll: wer hat wann was angefasst.
 *
 * Da alle mit Zugang die kompletten Personendaten sehen, ist das die
 * Stelle, an der sich das nachvollziehen laesst. Es gibt bewusst keinen
 * Knopf zum Loeschen: ein Protokoll, das man bereinigen kann, beantwortet
 * die Frage nicht mehr, fuer die es da ist.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiFehler, api } from "../../api/client.js";

type Zeile = {
  id: string;
  zeitpunkt: string;
  benutzerName: string | null;
  aktion: string;
  tabelle: string;
  datensatzId: string | null;
  vorher: Record<string, unknown> | null;
  nachher: Record<string, unknown> | null;
};

type Antwort = {
  zeilen: Zeile[];
  gesamt: number;
  seite: number;
  proSeite: number;
  tabellen: string[];
};

const AKTION_TEXT: Record<string, string> = {
  anlegen: "angelegt",
  aendern: "geaendert",
  loeschen: "geloescht",
  exportieren: "exportiert",
};

/** Zeigt die geaenderten Felder als "Feld: alt -> neu". */
function Unterschiede({ vorher, nachher }: { vorher: Zeile["vorher"]; nachher: Zeile["nachher"] }) {
  const felder = useMemo(
    () => [...new Set([...Object.keys(vorher ?? {}), ...Object.keys(nachher ?? {})])],
    [vorher, nachher],
  );

  if (felder.length === 0) return <span className="hinweis">keine Feldangaben</span>;

  const zeige = (wert: unknown) => {
    if (wert === null || wert === undefined) return "leer";
    if (typeof wert === "object") return JSON.stringify(wert);
    const text = String(wert);
    return text.length > 40 ? `${text.slice(0, 37)}...` : text;
  };

  return (
    <ul className="unterschiede">
      {felder.map((feld) => (
        <li key={feld}>
          <span className="feldname">{feld}</span>
          {vorher && feld in vorher && (
            <>
              {" "}
              <span className="alt">{zeige(vorher[feld])}</span> →
            </>
          )}{" "}
          <span className="neu">{zeige(nachher?.[feld])}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProtokollSeite() {
  const [antwort, setAntwort] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [tabelle, setTabelle] = useState("");
  const [aktion, setAktion] = useState("");
  const [suche, setSuche] = useState("");
  const [tage, setTage] = useState(90);
  const [seite, setSeite] = useState(1);

  useEffect(() => {
    const teile = new URLSearchParams({ tage: String(tage), seite: String(seite) });
    if (tabelle) teile.set("tabelle", tabelle);
    if (aktion) teile.set("aktion", aktion);
    if (suche.trim()) teile.set("suche", suche.trim());

    let abgebrochen = false;
    setLaedt(true);

    api
      .get<Antwort>(`/protokoll?${teile.toString()}`)
      .then((daten) => {
        if (!abgebrochen) {
          setAntwort(daten);
          setFehler(null);
        }
      })
      .catch((e: unknown) => {
        if (!abgebrochen) setFehler(e instanceof ApiFehler ? e.message : "Laden fehlgeschlagen.");
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });

    return () => {
      abgebrochen = true;
    };
  }, [tabelle, aktion, suche, tage, seite]);

  const seiten = antwort ? Math.max(1, Math.ceil(antwort.gesamt / antwort.proSeite)) : 1;

  return (
    <div className="seite-schmal protokollseite">
      <div className="seitenkopf">
        <h1>Protokoll</h1>
      </div>

      <p className="hinweis">
        Jede Aenderung an Stammdaten und Kalkulation wird hier festgehalten, mit altem und neuem
        Wert. Eintraege lassen sich nicht loeschen.
      </p>

      <div className="filterzeile">
        <input
          type="search"
          placeholder="Suchen: Benutzer oder Datensatz"
          value={suche}
          onChange={(e) => {
            setSuche(e.target.value);
            setSeite(1);
          }}
          aria-label="Protokoll durchsuchen"
        />
        <select
          value={tabelle}
          aria-label="Tabelle"
          onChange={(e) => {
            setTabelle(e.target.value);
            setSeite(1);
          }}
        >
          <option value="">alle Bereiche</option>
          {(antwort?.tabellen ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={aktion}
          aria-label="Aktion"
          onChange={(e) => {
            setAktion(e.target.value);
            setSeite(1);
          }}
        >
          <option value="">alle Aktionen</option>
          <option value="anlegen">angelegt</option>
          <option value="aendern">geaendert</option>
          <option value="loeschen">geloescht</option>
          <option value="exportieren">exportiert</option>
        </select>
        <select
          value={tage}
          aria-label="Zeitraum"
          onChange={(e) => {
            setTage(Number(e.target.value));
            setSeite(1);
          }}
        >
          <option value={7}>7 Tage</option>
          <option value={30}>30 Tage</option>
          <option value={90}>90 Tage</option>
          <option value={365}>1 Jahr</option>
          <option value={3650}>alles</option>
        </select>
      </div>

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}
      {laedt && <p className="hinweis">Wird geladen ...</p>}

      {antwort && !laedt && (
        <>
          <p className="hinweis">
            {antwort.gesamt} Eintrag/Eintraege, Seite {antwort.seite} von {seiten}
          </p>

          {antwort.zeilen.length === 0 && <p className="hinweis">Nichts gefunden.</p>}

          {antwort.zeilen.length > 0 && (
            <table className="tabelle protokolltabelle">
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Wer</th>
                  <th>Was</th>
                  <th>Aenderung</th>
                </tr>
              </thead>
              <tbody>
                {antwort.zeilen.map((z) => (
                  <tr key={z.id}>
                    <td className="zeitpunkt">
                      {new Date(z.zeitpunkt).toLocaleString("de-CH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>{z.benutzerName ?? <span className="hinweis">System</span>}</td>
                    <td>
                      <span className="schild">{z.tabelle}</span>{" "}
                      {AKTION_TEXT[z.aktion] ?? z.aktion}
                    </td>
                    <td>
                      <Unterschiede vorher={z.vorher} nachher={z.nachher} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {seiten > 1 && (
            <div className="blaettern">
              <button
                className="knopf-leise"
                disabled={antwort.seite <= 1}
                onClick={() => setSeite((s) => s - 1)}
              >
                zurueck
              </button>
              <button
                className="knopf-leise"
                disabled={antwort.seite >= seiten}
                onClick={() => setSeite((s) => s + 1)}
              >
                weiter
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
