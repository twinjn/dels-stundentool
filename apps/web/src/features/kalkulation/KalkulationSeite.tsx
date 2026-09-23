/**
 * Kalkulation: Deckungsbeitrag je Objekt und Ergebnis des Monats.
 *
 * Gerechnet wird mit rechne() aus @dels/shared, also mit genau der
 * Funktion, die auch der Server und der Export benutzen. Das hat zwei
 * Folgen, beide gewollt:
 *
 *  - Die Zahlen ändern sich sofort, während jemand an einem Ansatz
 *    dreht. Kein Warten auf den Server.
 *  - Es gibt keine zweite Rechenfassung im Browser, die irgendwann von
 *    der auf dem Server abweicht.
 *
 * Gespeichert wird im Hintergrund, Feld für Feld.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { chf, chf0, monatName, pct, rechne, vorzeichen } from "@dels/shared";
import { ApiFehler, api } from "../../api/client.js";
import { DruckKnopf, ExportKnopf } from "../../components/ExportKnopf.js";
import type { Adminzeile, MonatEintrag, Monatsdaten, ObjektZeile, PersonZeile } from "./typen.js";

/** Feld, das beim Verlassen speichert und vorher lokal weiterrechnet. */
function Wertfeld({
  wert,
  onAendern,
  breit,
  ausrichtung = "rechts",
}: {
  wert: string;
  onAendern: (neu: string) => void;
  breit?: number;
  ausrichtung?: "links" | "rechts";
}) {
  const [entwurf, setEntwurf] = useState(wert);
  useEffect(() => setEntwurf(wert), [wert]);

  return (
    <input
      className={`wertfeld ${ausrichtung}`}
      style={breit ? { width: breit } : undefined}
      value={entwurf}
      onChange={(e) => setEntwurf(e.target.value)}
      onBlur={() => {
        if (entwurf !== wert) onAendern(entwurf);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEntwurf(wert);
      }}
    />
  );
}

function Kachel({ titel, wert, hinweis }: { titel: string; wert: string; hinweis?: string }) {
  return (
    <div className="kachel">
      <span className="kachel-titel">{titel}</span>
      <span className="kachel-wert">{wert}</span>
      {hinweis && <span className="kachel-hinweis">{hinweis}</span>}
    </div>
  );
}

export function KalkulationSeite() {
  const [monate, setMonate] = useState<MonatEintrag[]>([]);
  const [monat, setMonat] = useState<string | null>(null);
  const [daten, setDaten] = useState<Monatsdaten | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zeigeAnsaetze, setZeigeAnsaetze] = useState(false);

  useEffect(() => {
    api
      .get<MonatEintrag[]>("/kalkulation/monate")
      .then((liste) => {
        setMonate(liste);
        setMonat((alt) => alt ?? liste[0]?.monat ?? null);
        if (liste.length === 0) setLaedt(false);
      })
      .catch((e: unknown) => {
        setFehler(e instanceof ApiFehler ? e.message : "Laden fehlgeschlagen.");
        setLaedt(false);
      });
  }, []);

  const laden = useCallback(async (welcher: string) => {
    setLaedt(true);
    setFehler(null);
    try {
      setDaten(await api.get<Monatsdaten>(`/kalkulation/${welcher}`));
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Laden fehlgeschlagen.");
      setDaten(null);
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    if (monat) void laden(monat);
  }, [monat, laden]);

  /** Hier passiert das Rechnen. Bei jeder Änderung sofort neu. */
  const ergebnis = useMemo(() => {
    if (!daten) return null;
    return rechne({
      monat: daten.monat,
      s: daten.ansaetze,
      objektMonat: daten.objektMonat,
      personMonat: daten.personMonat,
      adminkosten: daten.adminkosten,
      eintraege: daten.eintraege,
      mitarbeiter: daten.mitarbeiter,
    });
  }, [daten]);

  /**
   * Steht das Monatsergebnis auf vollständiger Erfassung?
   *
   * Zwei Lücken machen es unzuverlässig, und beide ziehen es in
   * dieselbe Richtung, nämlich zu gut:
   *
   *   - Objekte ohne Stunden bringen ihr Abo in den Umsatz, ohne dass
   *     Lohnkosten dagegenstehen
   *   - Personen mit Stunden, aber ohne hinterlegten Stundenlohn, zählen
   *     mit null Franken Lohnaufwand mit
   *
   * Beides ist im laufenden Monat der Normalfall und kein Fehler. Nur
   * darf das Ergebnis dann nicht so aussehen, als wäre es eines.
   */
  const basisUnvollstaendig =
    ergebnis !== null && (ergebnis.res.ohneStd > 0 || (ergebnis.t.ohneLohnsatz ?? 0) > 0);

  async function speichern(pfad: string, rumpf: unknown, oertlich: () => void) {
    // Erst lokal übernehmen, damit die Zahlen sofort stimmen, dann sichern.
    oertlich();
    try {
      await api.patch(pfad, rumpf);
      setFehler(null);
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Speichern fehlgeschlagen.");
      if (monat) void laden(monat);
    }
  }

  function aendereObjekt(zeile: ObjektZeile, feld: keyof ObjektZeile, wert: string | boolean) {
    if (!daten) return;
    void speichern(`/kalkulation/${daten.monat}/objekt/${zeile.objektId}`, { [feld]: wert }, () =>
      setDaten((alt) =>
        alt
          ? {
              ...alt,
              objektMonat: alt.objektMonat.map((o) =>
                o.objektId === zeile.objektId ? { ...o, [feld]: wert } : o,
              ),
            }
          : alt,
      ),
    );
  }

  function aenderePerson(zeile: PersonZeile, feld: keyof PersonZeile, wert: string | boolean) {
    if (!daten) return;
    void speichern(
      `/kalkulation/${daten.monat}/person/${zeile.mitarbeiterId}`,
      { [feld]: wert },
      () =>
        setDaten((alt) =>
          alt
            ? {
                ...alt,
                personMonat: alt.personMonat.map((p) =>
                  p.mitarbeiterId === zeile.mitarbeiterId ? { ...p, [feld]: wert } : p,
                ),
              }
            : alt,
        ),
    );
  }

  function aendereAnsatz(feld: string, wert: string | boolean) {
    if (!daten) return;
    void speichern(`/kalkulation/${daten.monat}`, { [feld]: wert }, () =>
      setDaten((alt) => (alt ? { ...alt, ansaetze: { ...alt.ansaetze, [feld]: wert } } : alt)),
    );
  }

  async function monatAnlegen() {
    const vorschlag = naechsterMonat(monate[0]?.monat);
    const gewuenscht = window.prompt("Welchen Monat anlegen? (JJJJ-MM-01)", vorschlag);
    if (!gewuenscht) return;

    try {
      await api.post(`/kalkulation/${gewuenscht}`);
      const liste = await api.get<MonatEintrag[]>("/kalkulation/monate");
      setMonate(liste);
      setMonat(gewuenscht);
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Anlegen fehlgeschlagen.");
    }
  }

  return (
    <div className="kalkulationsseite">
      <div className="seitenkopf">
        <div className="monatswahl">
          <h1>Kalkulation</h1>
          {monate.length > 0 && (
            <select
              value={monat ?? ""}
              onChange={(e) => setMonat(e.target.value)}
              aria-label="Monat"
            >
              {monate.map((m) => (
                <option key={m.monat} value={m.monat}>
                  {monatName(m.monat)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="kopfhinweise">
          {monat && (
            <ExportKnopf
              pfad={`/export/kalkulation?monat=${monat.slice(0, 7)}`}
              titel={`Die Kalkulation ${monatName(monat)} als Excel-Datei`}
            />
          )}
          <DruckKnopf />
          <button className="knopf" onClick={() => void monatAnlegen()}>
            Monat anlegen
          </button>
        </div>
      </div>

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}

      {monate.length === 0 && !laedt && (
        <p className="hinweis">
          Noch kein Monat angelegt. Der erste Monat uebernimmt alle aktiven Objekte, jeder weitere
          den Vormonat als Vorlage.
        </p>
      )}

      {laedt && <p className="hinweis">Wird geladen ...</p>}

      {daten && ergebnis && (
        <>
          {/*
            Die Warnungen stehen VOR den Kacheln, nicht darunter.
            Vorher war es umgekehrt, und das las sich falsch herum: erst
            ein Ergebnis in grossen gruenen Ziffern, darunter kleingedruckt
            der Grund, warum man ihm nicht trauen darf. Wer von oben nach
            unten liest, hat die Zahl dann schon geglaubt.
          */}
          {(ergebnis.t.ohneLohnsatz ?? 0) > 0 && (
            <p className="warnhinweis">
              {ergebnis.t.ohneLohnsatz} Person(en) haben Stunden erfasst, aber keinen Stundenlohn
              hinterlegt. Deren Lohnaufwand fehlt in dieser Rechnung, das Ergebnis ist also zu gut.
            </p>
          )}
          {ergebnis.res.ohneStd > 0 && (
            <p className="warnhinweis">
              {ergebnis.res.ohneStd} von {ergebnis.obj.length} Objekt(en) haben keine Stunden. Ihr
              Abo von {chf0(ergebnis.res.abosOhneGew)} steht im Umsatz, ohne dass Lohnkosten
              dagegenstehen. Solange die Erfassung fehlt, ist die Marge zu hoch.
            </p>
          )}

          <div className="kacheln">
            <Kachel titel="Abos" wert={chf0(ergebnis.t.abos ?? 0)} hinweis="nur aktive Objekte" />
            <Kachel titel="Lohn inkl. Sozialabgaben" wert={chf0(ergebnis.t.lohnSzAlle ?? 0)} />
            <Kachel
              titel="Deckungsbeitrag"
              wert={chf0(ergebnis.t.zt ?? 0)}
              hinweis="Abos minus Lohnkosten"
            />
            <Kachel titel="Administration" wert={chf0(ergebnis.res.adminTopf)} />
            {/*
              Solange Stunden fehlen, bekommt das Ergebnis KEINE Farbe.
              Gruen heisst "gut gelaufen", und das waere hier eine Aussage
              ueber einen Monat, von dem die Haelfte noch gar nicht erfasst
              ist. Dieselbe Regel gilt auf der Ferienseite fuer einen Saldo
              ohne Stichtag: die Zahl steht da, aber nicht als Tatsache.
            */}
            <div
              className={
                basisUnvollstaendig
                  ? "kachel kachel-gross kachel-unsicher"
                  : `kachel kachel-gross ${vorzeichen(ergebnis.res.ergebnis)}`
              }
            >
              <span className="kachel-titel">Ergebnis</span>
              <span className="kachel-wert">{chf0(ergebnis.res.ergebnis)}</span>
              <span className="kachel-hinweis">
                {basisUnvollstaendig
                  ? `Marge ${pct(ergebnis.res.marge)}, aber auf unvollständiger Erfassung`
                  : `Marge ${pct(ergebnis.res.marge)}`}
              </span>
            </div>
          </div>

          <details
            className="ansaetze"
            open={zeigeAnsaetze}
            onToggle={(e) => setZeigeAnsaetze((e.target as HTMLDetailsElement).open)}
          >
            <summary>Ansätze dieses Monats</summary>
            <p className="hinweis">
              Die Saetze gelten nur fuer {monatName(daten.monat)}. Aeltere Monate behalten ihre
              eigenen, sonst rechnet man die Vergangenheit mit heutigen Saetzen nach.
            </p>
            <div className="ansatzraster">
              {(
                [
                  ["ahv", "AHV"],
                  ["alv", "ALV"],
                  ["nbu", "NBU"],
                  ["bu", "BU"],
                  ["ktgObjekt", "KTG Objekt"],
                  ["ktgPersonal", "KTG Personal"],
                  ["rpk", "RPK"],
                  ["fak", "FAK"],
                  ["ml13", "13. Monatslohn"],
                  ["bvgSatz", "BVG-Satz"],
                  ["adminReserve", "Admin-Reserve"],
                ] as const
              ).map(([feld, beschriftung]) => (
                <label key={feld} className="ansatzfeld">
                  <span>{beschriftung}</span>
                  <Wertfeld
                    wert={String(daten.ansaetze[feld] ?? "")}
                    onAendern={(w) => aendereAnsatz(feld, w)}
                    breit={90}
                  />
                </label>
              ))}
              {(
                [
                  ["mat", "Material je Objekt"],
                  ["mas", "Maschinen je Objekt"],
                  ["trs", "Treibstoff je Objekt"],
                  ["trsTopf", "Treibstoff-Topf"],
                  ["nbuSchwelle", "NBU-Schwelle (Std./Woche)"],
                ] as const
              ).map(([feld, beschriftung]) => (
                <label key={feld} className="ansatzfeld">
                  <span>{beschriftung}</span>
                  <Wertfeld
                    wert={String(daten.ansaetze[feld] ?? "")}
                    onAendern={(w) => aendereAnsatz(feld, w)}
                    breit={90}
                  />
                </label>
              ))}
              <label className="ansatzfeld">
                <span>NBU trägt der Arbeitgeber</span>
                <input
                  type="checkbox"
                  checked={daten.ansaetze.nbuTraegtAg}
                  onChange={(e) => aendereAnsatz("nbuTraegtAg", e.target.checked)}
                />
              </label>
              <label className="ansatzfeld">
                <span>Treibstoff verteilen nach</span>
                <select
                  value={daten.ansaetze.trsSchluessel}
                  onChange={(e) => aendereAnsatz("trsSchluessel", e.target.value)}
                >
                  <option value="abos">Abo-Anteil</option>
                  <option value="objekt">gleichmässig je Objekt</option>
                </select>
              </label>
            </div>
          </details>

          <h2>Objekte</h2>
          <div className="rastercontainer">
            <table className="tabelle kalktabelle">
              <thead>
                <tr>
                  <th>Objekt</th>
                  <th className="rechts">Abo</th>
                  <th className="rechts">Std.</th>
                  <th className="rechts">Löhne</th>
                  <th className="rechts">inkl. Sozial</th>
                  <th className="rechts">Mat/Mas/Trs</th>
                  <th className="rechts">Admin</th>
                  <th className="rechts">Gewinn</th>
                  <th>aktiv</th>
                </tr>
              </thead>
              <tbody>
                {ergebnis.obj.map((r) => {
                  const zeile = r.o as ObjektZeile;
                  return (
                    <tr key={zeile.objektId} className={zeile.aktiv ? "" : "inaktiv"}>
                      <td>
                        <span className="objektnr">{zeile.objektNr ?? ""}</span> {zeile.objektName}
                        {r.ausErfassung && <span className="schild">aus Erfassung</span>}
                      </td>
                      <td className="rechts">
                        <Wertfeld
                          wert={String(zeile.aboBetrag ?? "")}
                          onAendern={(w) => aendereObjekt(zeile, "aboBetrag", w)}
                          breit={80}
                        />
                      </td>
                      <td className="rechts">
                        {r.ausErfassung ? (
                          <span title="aus der Stundenerfassung">{chf(r.std)}</span>
                        ) : (
                          <Wertfeld
                            wert={String(zeile.stdManuell ?? "")}
                            onAendern={(w) => aendereObjekt(zeile, "stdManuell", w)}
                            breit={70}
                          />
                        )}
                      </td>
                      <td className="rechts">{chf(r.loehne)}</td>
                      <td className="rechts">{chf(r.lohnSz)}</td>
                      <td className="rechts">{chf(r.mat + r.mas + r.trs)}</td>
                      <td className="rechts">{chf(r.admin)}</td>
                      <td className={`rechts ${vorzeichen(r.gew)}`}>{chf(r.gew)}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={zeile.aktiv}
                          aria-label={`${zeile.objektName} aktiv`}
                          onChange={(e) => aendereObjekt(zeile, "aktiv", e.target.checked)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>{ergebnis.obj.length} Objekte</td>
                  <td className="rechts">{chf(ergebnis.t.abos ?? 0)}</td>
                  <td className="rechts">{chf(ergebnis.t.stdTotal ?? 0)}</td>
                  <td className="rechts">{chf(ergebnis.t.loehne ?? 0)}</td>
                  <td className="rechts">{chf(ergebnis.t.lohnSzObj ?? 0)}</td>
                  <td className="rechts">
                    {chf((ergebnis.t.mat ?? 0) + (ergebnis.t.mas ?? 0) + (ergebnis.t.trs ?? 0))}
                  </td>
                  <td className="rechts">{chf(ergebnis.t.admin ?? 0)}</td>
                  <td className={`rechts ${vorzeichen(ergebnis.t.gew ?? 0)}`}>
                    {chf(ergebnis.t.gew ?? 0)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {ergebnis.staff.length > 0 && (
            <>
              <h2>Personal ohne Objektbezug</h2>
              <div className="rastercontainer">
                <table className="tabelle kalktabelle">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th className="rechts">Lohn</th>
                      <th className="rechts">Spesen</th>
                      <th className="rechts">13.</th>
                      <th className="rechts">FAK</th>
                      <th className="rechts">BVG</th>
                      <th className="rechts">inkl. Sozial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ergebnis.staff.map((r) => {
                      const zeile = r.p as PersonZeile;
                      return (
                        <tr key={zeile.mitarbeiterId}>
                          <td>{zeile.name}</td>
                          <td className="rechts">
                            <Wertfeld
                              wert={String(zeile.lohn ?? "")}
                              onAendern={(w) => aenderePerson(zeile, "lohn", w)}
                              breit={90}
                            />
                          </td>
                          <td className="rechts">
                            <Wertfeld
                              wert={String(zeile.spesen ?? "")}
                              onAendern={(w) => aenderePerson(zeile, "spesen", w)}
                              breit={80}
                            />
                          </td>
                          <td className="rechts">{chf(r.ml13)}</td>
                          <td className="rechts">{chf(r.fak)}</td>
                          <td className="rechts">{chf(r.bvg)}</td>
                          <td className="rechts">{chf(r.lohnSz)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{ergebnis.staff.length} Personen</td>
                      <td className="rechts">
                        {chf(ergebnis.staff.reduce((a, r) => a + r.lohn, 0))}
                      </td>
                      <td className="rechts">{chf(ergebnis.t.spesen ?? 0)}</td>
                      <td className="rechts">{chf(ergebnis.t.ml13 ?? 0)}</td>
                      <td className="rechts">{chf(ergebnis.t.fak ?? 0)}</td>
                      <td className="rechts">{chf(ergebnis.t.bvg ?? 0)}</td>
                      <td className="rechts">{chf(ergebnis.t.lohnSzPers ?? 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          <Adminkosten
            monat={daten.monat}
            posten={daten.adminkosten}
            reserve={String(daten.ansaetze.adminReserve ?? "0")}
            topf={ergebnis.res.adminTopf}
            onGeaendert={() => void laden(daten.monat)}
            onFehler={setFehler}
          />
        </>
      )}
    </div>
  );
}

function naechsterMonat(letzter: string | undefined): string {
  const basis = letzter ? new Date(`${letzter}T00:00:00Z`) : new Date();
  const jahr = basis.getUTCFullYear();
  const monat = basis.getUTCMonth() + (letzter ? 2 : 1);
  const gesamt = jahr * 12 + (monat - 1);
  return `${Math.floor(gesamt / 12)}-${String((gesamt % 12) + 1).padStart(2, "0")}-01`;
}

function Adminkosten({
  monat,
  posten,
  reserve,
  topf,
  onGeaendert,
  onFehler,
}: {
  monat: string;
  posten: Adminzeile[];
  reserve: string;
  topf: number;
  onGeaendert: () => void;
  onFehler: (text: string) => void;
}) {
  const [position, setPosition] = useState("");
  const [betrag, setBetrag] = useState("");

  const summe = posten.reduce((a, p) => a + Number(p.betrag ?? 0), 0);

  async function versuche(aktion: () => Promise<unknown>) {
    try {
      await aktion();
      onGeaendert();
    } catch (e: unknown) {
      onFehler(e instanceof ApiFehler ? e.message : "Fehlgeschlagen.");
    }
  }

  return (
    <>
      <h2>Administrationskosten</h2>
      <table className="tabelle kalktabelle schmal">
        <tbody>
          {posten.map((p) => (
            <tr key={p.id}>
              <td>{p.position}</td>
              <td className="rechts">
                <Wertfeld
                  wert={String(p.betrag ?? "")}
                  onAendern={(w) =>
                    void versuche(() =>
                      api.patch(`/kalkulation/${monat}/adminkosten/${p.id}`, { betrag: w }),
                    )
                  }
                  breit={90}
                />
              </td>
              <td className="rechts">
                <button
                  className="knopf-leise"
                  onClick={() =>
                    void versuche(() => api.delete(`/kalkulation/${monat}/adminkosten/${p.id}`))
                  }
                >
                  entfernen
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <input
                className="wertfeld links"
                placeholder="Neue Position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                style={{ width: 220 }}
              />
            </td>
            <td className="rechts">
              <input
                className="wertfeld rechts"
                placeholder="Betrag"
                value={betrag}
                onChange={(e) => setBetrag(e.target.value)}
                style={{ width: 90 }}
              />
            </td>
            <td className="rechts">
              <button
                className="knopf-leise"
                disabled={position.trim() === "" || betrag.trim() === ""}
                onClick={() =>
                  void versuche(async () => {
                    await api.post(`/kalkulation/${monat}/adminkosten`, { position, betrag });
                    setPosition("");
                    setBetrag("");
                  })
                }
              >
                hinzufügen
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Summe, plus {pct(Number(reserve))} Reserve</td>
            <td className="rechts">{chf(summe)}</td>
            <td className="rechts">{chf(topf)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
