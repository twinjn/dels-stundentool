/**
 * Ferienstand je Mitarbeiter.
 *
 * Die Seite zeigt zwei Gruppen getrennt, und das ist der ganze Punkt:
 *
 *   Monatslohn   Anspruch, Uebertrag, Bezug, Rest. Hier gibt es einen
 *                Saldo, und der ist planbar.
 *   Stundenlohn  Zuschlag auf den Stundenlohn. Hier gibt es keinen
 *                Saldo, weil die Ferien mit jedem Lohn schon bezahlt
 *                sind.
 *
 * Beides in eine Tabelle zu pressen waere kuerzer und wuerde der
 * grossen Gruppe eine Zahl hinstellen, die es fuer sie gar nicht gibt.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiFehler, api } from "../../api/client.js";
import { useAuth } from "../../app/AuthKontext.js";
import { hatRecht } from "@dels/shared";
import type { FerienMonatslohn, FerienStundenlohn, Ferienstand } from "./typen.js";

const tage = (wert: number): string => wert.toLocaleString("de-CH", { maximumFractionDigits: 1 });

const franken = (wert: number): string =>
  wert.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const prozent = (anteil: number): string =>
  (anteil * 100).toLocaleString("de-CH", { maximumFractionDigits: 3 });

/**
 * Die brauchbarste Meldung aus einem Fehler ziehen.
 *
 * Bei einer abgelehnten Eingabe schickt die API "Eingabe ist ungültig"
 * als Sammelmeldung und daneben pro Feld, was genau klemmt. Nur die
 * Sammelmeldung anzuzeigen ist der Unterschied zwischen "irgendwas
 * stimmt nicht" und "Begründung angeben".
 */
function meldung(e: unknown, ersatz: string): string {
  if (!(e instanceof ApiFehler)) return ersatz;
  const feld = e.felder[0];
  return feld ? feld.problem : e.message;
}

function heutigesJahr(): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date()).slice(0, 4),
  );
}

export function FerienSeite() {
  const { benutzer } = useAuth();
  const darfSchreiben = benutzer ? hatRecht(benutzer.rolle, "stammdaten:schreiben") : false;

  const [jahr, setJahr] = useState(heutigesJahr());
  const [suche, setSuche] = useState("");
  const [daten, setDaten] = useState<Ferienstand | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Nach dem Speichern neu laden, ohne den Effekt umzubauen. */
  const [frisch, setFrisch] = useState(0);

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);

    api
      .get<Ferienstand>(`/ferien?jahr=${jahr}`)
      .then((d) => {
        if (!abgebrochen) setDaten(d);
      })
      .catch((e: unknown) => {
        if (!abgebrochen) {
          setFehler(e instanceof ApiFehler ? e.message : "Der Ferienstand konnte nicht laden.");
        }
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });

    return () => {
      abgebrochen = true;
    };
  }, [jahr, frisch]);

  const { monatslohn, stundenlohn } = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    const zeilen = (daten?.zeilen ?? []).filter(
      (z) => !begriff || z.name.toLowerCase().includes(begriff),
    );
    return {
      monatslohn: zeilen.filter((z): z is FerienMonatslohn => z.art === "monat"),
      stundenlohn: zeilen.filter((z): z is FerienStundenlohn => z.art === "stunde"),
    };
  }, [daten, suche]);

  return (
    <div className="ferienseite">
      <div className="seitenkopf">
        <div className="monatswahl">
          <button className="knopf-leise" onClick={() => setJahr(jahr - 1)} aria-label="Vorjahr">
            ‹
          </button>
          <h1>Ferien {jahr}</h1>
          <button className="knopf-leise" onClick={() => setJahr(jahr + 1)} aria-label="Folgejahr">
            ›
          </button>
          {jahr !== heutigesJahr() && (
            <button className="knopf-leise" onClick={() => setJahr(heutigesJahr())}>
              heute
            </button>
          )}
        </div>
        <input
          className="feld"
          type="search"
          placeholder="Name suchen"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>

      {fehler && <p className="fehlermeldung">{fehler}</p>}
      {laedt && <p className="hinweis">Einen Moment ...</p>}

      {!laedt && !fehler && (
        <>
          <MonatslohnTabelle
            zeilen={monatslohn}
            jahr={jahr}
            darfSchreiben={darfSchreiben}
            neuLaden={() => setFrisch((n) => n + 1)}
          />
          <StundenlohnTabelle zeilen={stundenlohn} darfLoehne={daten?.darfLoehne ?? false} />
        </>
      )}
    </div>
  );
}

// --- Monatslohn ----------------------------------------------------------

function MonatslohnTabelle({
  zeilen,
  jahr,
  darfSchreiben,
  neuLaden,
}: {
  zeilen: FerienMonatslohn[];
  jahr: number;
  darfSchreiben: boolean;
  neuLaden: () => void;
}) {
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);

  return (
    <section className="karte">
      <h2>Monatslohn</h2>
      <p className="hinweis">
        Ferien in Tagen. Was am Jahresende übrig ist, läuft automatisch ins nächste Jahr.
      </p>

      {zeilen.some((z) => z.verlaufUnvollstaendig) && (
        <p className="warnhinweis">
          Bei den grau gesetzten Zeilen fehlt ein Stichtag. Der Übertrag wurde aus den erfassten
          Jahren hochgerechnet, und wo Erfassung fehlt, sieht das aus wie nicht bezogener Urlaub.
          Die Zahl wird erst verlässlich, wenn bei der Person unter Mitarbeiter ein Ferien-Saldo mit
          Stichtag hinterlegt ist. Ab dort rechnet das Tool selbst weiter.
        </p>
      )}

      {zeilen.length === 0 ? (
        <p className="leerhinweis">Niemand im Monatslohn.</p>
      ) : (
        <table className="tabelle ferientabelle">
          <thead>
            <tr>
              <th>Name</th>
              <th className="rechts">Übertrag</th>
              <th className="rechts">Anspruch</th>
              <th className="rechts">Bezogen</th>
              <th className="rechts">Rest</th>
              {darfSchreiben && <th />}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <MonatsZeile
                key={z.id}
                zeile={z}
                jahr={jahr}
                darfSchreiben={darfSchreiben}
                offen={bearbeitet === z.id}
                oeffnen={() => setBearbeitet(bearbeitet === z.id ? null : z.id)}
                schliessen={() => setBearbeitet(null)}
                neuLaden={neuLaden}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MonatsZeile({
  zeile,
  jahr,
  darfSchreiben,
  offen,
  oeffnen,
  schliessen,
  neuLaden,
}: {
  zeile: FerienMonatslohn;
  jahr: number;
  darfSchreiben: boolean;
  offen: boolean;
  oeffnen: () => void;
  schliessen: () => void;
  neuLaden: () => void;
}) {
  return (
    <>
      <tr className={zeile.verlaufUnvollstaendig ? "unsicher" : undefined}>
        <td>
          {zeile.name}
          {zeile.verlaufUnvollstaendig && (
            <span
              className="schild schild-warnung"
              title={
                "Für diese Person ist kein Stichtag hinterlegt. Der Übertrag wurde aus " +
                "den erfassten Jahren gerechnet. Fehlt dort Erfassung, sieht das aus wie " +
                "nicht bezogener Urlaub."
              }
            >
              ungesichert
            </span>
          )}
        </td>
        <td className="rechts">
          {tage(zeile.uebertrag)}
          {zeile.uebertragGesetzt && (
            <span className="schild" title={zeile.uebertragBemerkung ?? undefined}>
              gesetzt
            </span>
          )}
        </td>
        <td className="rechts">
          {tage(zeile.anspruch)}
          {zeile.anteilig && (
            <span className="schild" title={`Voller Jahresanspruch: ${tage(zeile.anspruchVoll)}`}>
              anteilig
            </span>
          )}
        </td>
        <td className="rechts">{tage(zeile.bezogen)}</td>
        <td
          className={
            zeile.verlaufUnvollstaendig
              ? "rechts"
              : zeile.rest < 0
                ? "rechts summe neg"
                : "rechts summe"
          }
        >
          {tage(zeile.rest)}
        </td>
        {darfSchreiben && (
          <td className="rechts">
            <button type="button" className="knopf-leise" onClick={oeffnen}>
              {offen ? "abbrechen" : "Übertrag"}
            </button>
          </td>
        )}
      </tr>
      {offen && (
        <tr className="unterzeile">
          <td colSpan={6}>
            <UebertragFormular
              zeile={zeile}
              jahr={jahr}
              fertig={() => {
                schliessen();
                neuLaden();
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function UebertragFormular({
  zeile,
  jahr,
  fertig,
}: {
  zeile: FerienMonatslohn;
  jahr: number;
  fertig: () => void;
}) {
  const [tageText, setTageText] = useState(String(zeile.uebertrag));
  const [bemerkung, setBemerkung] = useState(zeile.uebertragBemerkung ?? "");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern(): Promise<void> {
    setLaeuft(true);
    setFehler(null);
    try {
      await api.put(`/ferien/${zeile.id}/${jahr}`, {
        tage: Number(tageText.replace(",", ".")),
        bemerkung,
      });
      fertig();
    } catch (e: unknown) {
      setFehler(meldung(e, "Speichern hat nicht geklappt."));
      setLaeuft(false);
    }
  }

  async function zuruecksetzen(): Promise<void> {
    setLaeuft(true);
    setFehler(null);
    try {
      await api.delete(`/ferien/${zeile.id}/${jahr}`);
      fertig();
    } catch (e: unknown) {
      setFehler(meldung(e, "Zurücksetzen hat nicht geklappt."));
      setLaeuft(false);
    }
  }

  return (
    <div className="uebertragformular">
      <p className="hinweis">
        Der Übertrag wird normalerweise gerechnet. Ein Wert hier übersteuert ihn, zum Beispiel wenn
        Resttage bewusst gestrichen werden. Die Begründung steht später im Protokoll.
      </p>

      <div className="feldgruppe">
        <label className="feld-schmal">
          <span>Tage aus {jahr - 1}</span>
          <input
            className="feld"
            type="text"
            inputMode="decimal"
            value={tageText}
            onChange={(e) => setTageText(e.target.value)}
          />
        </label>
        <label className="feld-breit">
          <span>Begründung</span>
          <input
            className="feld"
            type="text"
            value={bemerkung}
            placeholder="Warum wird der gerechnete Wert überschrieben?"
            onChange={(e) => setBemerkung(e.target.value)}
          />
        </label>
      </div>

      {fehler && <p className="fehlermeldung">{fehler}</p>}

      <div className="formularfuss">
        <button className="knopf" onClick={() => void speichern()} disabled={laeuft}>
          Speichern
        </button>
        {zeile.uebertragGesetzt && (
          <button className="knopf-leise" onClick={() => void zuruecksetzen()} disabled={laeuft}>
            Wieder rechnen lassen
          </button>
        )}
      </div>
    </div>
  );
}

// --- Stundenlohn ---------------------------------------------------------

function StundenlohnTabelle({
  zeilen,
  darfLoehne,
}: {
  zeilen: FerienStundenlohn[];
  darfLoehne: boolean;
}) {
  return (
    <section className="karte">
      <h2>Stundenlohn</h2>
      <p className="hinweis">
        Hier gibt es keinen Saldo in Tagen. Die Ferienentschädigung wird als Zuschlag auf den
        Stundenlohn ausbezahlt und ist mit jeder Lohnzahlung abgegolten. Fünf Wochen Ferien
        entsprechen 10.638 Prozent, weil sie in 47 Arbeitswochen mitverdient werden müssen.
      </p>

      {zeilen.length === 0 ? (
        <p className="leerhinweis">Niemand im Stundenlohn.</p>
      ) : (
        <table className="tabelle ferientabelle">
          <thead>
            <tr>
              <th>Name</th>
              <th className="rechts">Wochen</th>
              <th className="rechts">Zuschlag</th>
              <th className="rechts">Stunden</th>
              {darfLoehne && <th className="rechts">Basis</th>}
              {darfLoehne && <th className="rechts">Entschädigung</th>}
              <th className="rechts">Bezogen</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.id}>
                <td>{z.name}</td>
                <td className="rechts">{tage(z.wochen)}</td>
                <td className="rechts">{prozent(z.zuschlag)} %</td>
                <td className="rechts">{tage(z.stunden)}</td>
                {darfLoehne && (
                  <td className="rechts">{z.basis === null ? "–" : franken(z.basis)}</td>
                )}
                {darfLoehne && (
                  <td className="rechts summe">
                    {z.entschaedigung === null ? (
                      <span
                        className="schild schild-warnung"
                        title="Ohne hinterlegten Stundenlohn lässt sich die Entschädigung nicht rechnen."
                      >
                        kein Lohn
                      </span>
                    ) : (
                      franken(z.entschaedigung)
                    )}
                  </td>
                )}
                <td className="rechts">{z.bezogen === 0 ? "" : tage(z.bezogen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
