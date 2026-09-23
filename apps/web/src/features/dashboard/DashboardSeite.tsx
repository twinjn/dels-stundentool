/**
 * Startseite: eine Lagemeldung, keine Begrüssung.
 *
 * Die Frage, die diese Seite beantworten soll, ist nicht "wie geht es
 * dir", sondern "was ist diesen Monat erfasst und was fehlt noch". Alle
 * Zahlen kommen aus den Einträgen, nichts ist geschätzt oder
 * hochgerechnet. Gerechnet wird im Server, hier wird nur angezeigt.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiFehler, api } from "../../api/client.js";
import { DruckKnopf, ExportKnopf } from "../../components/ExportKnopf.js";
import type { Lagebild, Person } from "./typen.js";

const MONATE = [
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

function monatText(monat: string): string {
  const [jahr, nr] = monat.split("-");
  return `${MONATE[Number(nr) - 1] ?? monat} ${jahr}`;
}

function heutigerMonat(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" })
    .format(new Date())
    .slice(0, 7);
}

function monatVerschieben(monat: string, schritte: number): string {
  const [jahr, nr] = monat.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(jahr, nr - 1 + schritte, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const zahl = (wert: number, stellen = 1): string =>
  wert.toLocaleString("de-CH", { maximumFractionDigits: stellen });

/**
 * Veränderung gegenüber dem Vormonat.
 *
 * Der Vergleich ist nur ehrlich, weil der Server im laufenden Monat auch
 * im Vormonat nur bis zum gleichen Tag rechnet. Sonst stünde hier am
 * 2. jedes Monats "93 % weniger als im Vormonat".
 */
function trend(jetzt: number, vorher: number): { text: string; art: string } {
  if (!vorher) return { text: "kein Vormonat zum Vergleich", art: "" };
  const anteil = (jetzt - vorher) / vorher;
  if (Math.abs(anteil) < 0.005) return { text: "gleich wie im Vormonat", art: "" };
  const prozent = Math.abs(anteil * 100).toFixed(0);
  return anteil > 0
    ? { text: `${prozent} % mehr als im Vormonat`, art: "hoch" }
    : { text: `${prozent} % weniger als im Vormonat`, art: "runter" };
}

function namenliste(leute: Person[], anzahl: number, wieViele = 4): string {
  const namen = leute
    .slice(0, wieViele)
    .map((p) => p.name)
    .join(", ");
  return anzahl > wieViele ? `${namen} und ${anzahl - wieViele} weitere` : namen;
}

function Kachel({
  titel,
  wert,
  einheit,
  hinweis,
  art,
}: {
  titel: string;
  wert: string;
  einheit?: string;
  hinweis?: string;
  art?: string;
}) {
  return (
    <div className="kachel">
      <span className="kachel-titel">{titel}</span>
      <span className="kachel-wert">
        {wert}
        {einheit && <span className="kachel-einheit"> {einheit}</span>}
      </span>
      {hinweis && <span className={`kachel-hinweis ${art ?? ""}`}>{hinweis}</span>}
    </div>
  );
}

function Aufgabe({
  anzahl,
  titel,
  namen,
  hinweis,
  onKlick,
}: {
  anzahl: number;
  titel: string;
  namen: string;
  hinweis?: string;
  onKlick: () => void;
}) {
  return (
    <button type="button" className="aufgabe" onClick={onKlick}>
      <span className="aufgabe-zahl">{anzahl}</span>
      <span className="aufgabe-text">
        <span className="aufgabe-titel">{titel}</span>
        <span className="aufgabe-namen">{namen}</span>
        {hinweis && <span className="aufgabe-hinweis">{hinweis}</span>}
      </span>
      <span className="aufgabe-pfeil" aria-hidden="true">
        →
      </span>
    </button>
  );
}

export function DashboardSeite() {
  const [monat, setMonat] = useState(heutigerMonat());
  const [lage, setLage] = useState<Lagebild | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const navigiere = useNavigate();

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    setFehler(null);

    api
      .get<Lagebild>(`/dashboard?monat=${monat}`)
      .then((d) => {
        if (!abgebrochen) setLage(d);
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
  }, [monat]);

  const absenztage = lage
    ? (lage.absenzen.ferien ?? 0) + (lage.absenzen.krankheit ?? 0) + (lage.absenzen.unfall ?? 0)
    : 0;

  const groesste = lage?.topObjekte[0]?.stunden ?? 0;
  const stundenTrend = lage ? trend(lage.stunden.zeitraum, lage.stunden.vormonat) : null;

  const aufgaben = [];
  if (lage) {
    if (lage.offen.ferienMinus.length > 0) {
      aufgaben.push({
        schluessel: "ferien-minus",
        anzahl: lage.offen.ferienMinus.length,
        titel: "im Ferienminus",
        namen: lage.offen.ferienMinus
          .slice(0, 4)
          .map((p) => `${p.name} (${zahl(p.rest)})`)
          .join(", "),
        hinweis: lage.offen.ferienMinus.some((p) => p.unsicher)
          ? "Anspruch und Übertrag sind eingerechnet, bei einzelnen fehlt aber ein Stichtag"
          : "Anspruch und Übertrag aus dem Vorjahr sind eingerechnet",
        ziel: () => navigiere("/ferien"),
      });
    }
    if (lage.offen.ferienOffen && lage.offen.ferienOffen.length > 0) {
      const tage = lage.offen.ferienOffen.reduce((summe, p) => summe + p.rest, 0);
      const unsicher = lage.offen.ferienOffen.filter((p) => p.unsicher).length;
      aufgaben.push({
        schluessel: "ferien-offen",
        anzahl: lage.offen.ferienOffen.length,
        titel: "haben noch Ferientage offen",
        namen: lage.offen.ferienOffen
          .slice(0, 4)
          .map((p) => `${p.name} (${zahl(p.rest)})`)
          .join(", "),
        // Der Zweck der Meldung steht dran, sonst wirkt sie wie eine
        // Rüge statt wie eine Planungshilfe.
        //
        // Und der Vorbehalt kommt mit: die Ferienseite kennzeichnet
        // Saldi ohne Stichtag sorgfältig, und wenn hier dieselbe Zahl
        // ohne den Hinweis steht, ist die Sorgfalt dort wertlos.
        hinweis:
          unsicher > 0
            ? `${zahl(tage)} Tage bis Jahresende einzuplanen, davon ${unsicher} ohne Stichtag und darum unsicher`
            : `${zahl(tage)} Tage bis Jahresende einzuplanen`,
        ziel: () => navigiere("/ferien"),
      });
    }
    if (lage.offen.ohneErfassungAnzahl > 0) {
      aufgaben.push({
        schluessel: "erfassung",
        anzahl: lage.offen.ohneErfassungAnzahl,
        titel: "Mitarbeitende ohne erfasste Stunden in diesem Zeitraum",
        namen: namenliste(lage.offen.ohneErfassung, lage.offen.ohneErfassungAnzahl),
        ziel: () => navigiere("/stunden"),
      });
    }
    if (lage.offen.ohneStundenlohn && lage.offen.ohneStundenlohn.length > 0) {
      aufgaben.push({
        schluessel: "lohn",
        anzahl: lage.offen.ohneStundenlohn.length,
        titel: "Mitarbeitende ohne hinterlegten Stundenlohn",
        namen: namenliste(lage.offen.ohneStundenlohn, lage.offen.ohneStundenlohn.length),
        hinweis: "zählen in der Kalkulation mit 0 CHF Lohnkosten mit",
        ziel: () => navigiere("/mitarbeiter"),
      });
    }
  }

  return (
    <div className="dashboardseite">
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
          <ExportKnopf
            pfad={`/export/stunden?monat=${monat}`}
            titel={`Das Monatsblatt ${monatText(monat)} als Excel-Datei`}
          />
          <DruckKnopf />
        </div>
      </div>

      {lage?.laufend && (
        <p className="hinweis">
          Laufender Monat: gerechnet bis {lage.bis.slice(8)}.{lage.bis.slice(5, 7)}. Der Vormonat
          wird bis zum gleichen Tag verglichen, sonst sähe jeder Monatsanfang nach einem Einbruch
          aus.
        </p>
      )}

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}

      {laedt && !lage && <p className="hinweis">Wird geladen ...</p>}

      {lage && (
        <>
          <section className="kacheln">
            <Kachel
              titel="Gearbeitete Stunden"
              wert={zahl(lage.stunden.zeitraum)}
              hinweis={stundenTrend?.text}
              art={stundenTrend?.art}
            />
            <Kachel
              titel="Absenztage"
              wert={zahl(absenztage)}
              hinweis="Ferien, Krankheit und Unfall"
            />
            <Kachel
              titel="Mitarbeitende erfasst"
              wert={String(lage.mitarbeiter.mitErfassung)}
              einheit={`von ${lage.mitarbeiter.gesamt}`}
              hinweis={
                lage.offen.ohneErfassungAnzahl > 0
                  ? `${lage.offen.ohneErfassungAnzahl} noch ohne Eintrag`
                  : "alle erfasst"
              }
              art={lage.offen.ohneErfassungAnzahl > 0 ? "offen" : "hoch"}
            />
            <Kachel
              titel="Objekte bebucht"
              wert={String(lage.objekte.bebucht)}
              einheit={`von ${lage.objekte.gesamt}`}
              hinweis="mit Stunden in diesem Zeitraum"
            />
          </section>

          <div className="start-spalten">
            <section className="startkarte">
              <h2>Zu erledigen</h2>
              {aufgaben.length > 0 ? (
                <div className="aufgaben">
                  {aufgaben.map((a) => (
                    <Aufgabe
                      key={a.schluessel}
                      anzahl={a.anzahl}
                      titel={a.titel}
                      namen={a.namen}
                      hinweis={a.hinweis}
                      onKlick={a.ziel}
                    />
                  ))}
                </div>
              ) : (
                <p className="hinweis">
                  Nichts offen. Alle aktiven Mitarbeitenden haben Einträge in diesem Zeitraum.
                </p>
              )}
            </section>

            <section className="startkarte">
              <h2>Stunden nach Objekt</h2>
              {lage.topObjekte.length > 0 ? (
                <>
                  <div className="objektliste">
                    {lage.topObjekte.map((o) => (
                      <div key={o.id} className="objektzeile">
                        <div className="objektzeile-kopf">
                          <span className="objektzeile-name" title={o.name}>
                            {o.objektNr ? `${o.objektNr} ` : ""}
                            {o.name}
                          </span>
                          <span className="objektzeile-std">{zahl(o.stunden)}</span>
                        </div>
                        <div className="objektbalken">
                          <div
                            className="objektbalken-fuell"
                            style={{ width: `${groesste ? (o.stunden / groesste) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {lage.objekte.bebucht > lage.topObjekte.length && (
                    <p className="hinweis">
                      und {lage.objekte.bebucht - lage.topObjekte.length} weitere Objekte mit
                      Stunden
                    </p>
                  )}
                </>
              ) : (
                <p className="hinweis">
                  In diesem Zeitraum sind noch keine Stunden auf Objekte gebucht.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
