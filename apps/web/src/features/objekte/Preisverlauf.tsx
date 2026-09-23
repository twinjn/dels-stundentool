/**
 * Preisverlauf eines Objekts.
 *
 * Das Feld "Abo pro Monat" auf dem Stammblatt zeigt den Preis, der
 * HEUTE gilt. Dahinter steht diese Liste: jeder Preis mit dem Tag, ab
 * dem er greift.
 *
 * Der Unterschied zählt beim Anlegen eines Kalkulationsmonats. Der
 * nimmt nicht das Stammblatt, sondern den Preis, der am Ersten jenes
 * Monats galt. Eine Erhöhung per 1. Juli verändert dadurch den Juni
 * nicht mehr, und der Juli bekommt sie automatisch, auch wenn ihn
 * jemand erst im Herbst anlegt.
 */
import { useCallback, useEffect, useState } from "react";
import { chf } from "@dels/shared";
import { ApiFehler, api } from "../../api/client.js";
import type { Preiseintrag } from "../kalkulation/typen.js";

/** Der erste Tag des nächsten Monats, als vernünftiger Vorschlag. */
function naechsterErster(): string {
  const heute = new Date();
  const jahr = heute.getFullYear();
  const monat = heute.getMonth() + 1;
  return monat === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(monat + 1).padStart(2, "0")}-01`;
}

function alsDatum(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

export function Preisverlauf({
  objektId,
  darfSchreiben,
  onGeaendert,
}: {
  objektId: string;
  darfSchreiben: boolean;
  onGeaendert: () => void;
}) {
  const [liste, setListe] = useState<Preiseintrag[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ab, setAb] = useState(naechsterErster);
  const [betrag, setBetrag] = useState("");
  const [bemerkung, setBemerkung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    try {
      setListe(await api.get<Preiseintrag[]>(`/objekte/${objektId}/preise`));
      setFehler(null);
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Preise konnten nicht geladen werden.");
    }
  }, [objektId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

  async function hinzufuegen() {
    setLaeuft(true);
    setFehler(null);
    try {
      await api.post(`/objekte/${objektId}/preise`, {
        gueltigAb: ab,
        betrag,
        bemerkung: bemerkung.trim() === "" ? null : bemerkung.trim(),
      });
      setBetrag("");
      setBemerkung("");
      await laden();
      onGeaendert();
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function entfernen(eintrag: Preiseintrag) {
    if (
      !window.confirm(
        `Preis ${chf(Number(eintrag.betrag))} ab ${alsDatum(eintrag.gueltigAb)} entfernen?\n\n` +
          "Schon angelegte Kalkulationsmonate behalten ihren Betrag. " +
          "Nur künftige Monate holen sich dann einen anderen Preis.",
      )
    ) {
      return;
    }
    try {
      await api.delete(`/objekte/${objektId}/preise/${eintrag.id}`);
      await laden();
      onGeaendert();
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Entfernen fehlgeschlagen.");
    }
  }

  return (
    <details className="preisverlauf">
      <summary>Preisverlauf{liste ? ` (${liste.length})` : ""}</summary>

      <p className="hinweis">
        Das Feld oben zeigt den Preis, der heute gilt. Hier steht, ab wann welcher Preis greift. Ein
        Kalkulationsmonat nimmt immer den Preis vom Ersten jenes Monats.
      </p>

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}

      {liste && liste.length === 0 && <p className="hinweis">Noch kein Preis hinterlegt.</p>}

      {/*
        Eine Liste, keine Tabelle.

        Die rechte Spalte ist rund 370 Pixel breit. Vier Tabellenspalten
        passen da nicht hinein: die Bemerkung bricht auf sechs Zeilen um
        und der Knopf rutscht aus dem Bild. Datum und Betrag gehören
        ohnehin zusammen, die Bemerkung darunter.
      */}
      {liste && liste.length > 0 && (
        <ul className="preisliste">
          {liste.map((p) => (
            <li key={p.id} className={p.gueltigAb > heute ? "kuenftig" : ""}>
              <div className="preiskopf">
                <span className="preisdatum">
                  ab {alsDatum(p.gueltigAb)}
                  {p.gueltigAb > heute && <span className="schild">künftig</span>}
                </span>
                <span className="preisbetrag">{chf(Number(p.betrag))}</span>
                {darfSchreiben && (
                  <button
                    type="button"
                    className="knopf-leise"
                    title="Diesen Preiseintrag entfernen"
                    onClick={() => void entfernen(p)}
                  >
                    entfernen
                  </button>
                )}
              </div>
              {(p.bemerkung || p.erfasstVon) && (
                <div className="leise">
                  {p.bemerkung ?? ""}
                  {p.erfasstVon ? ` (${p.erfasstVon})` : ""}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {darfSchreiben && (
        <div className="preiszeile">
          <label>
            <span>Gültig ab</span>
            <input type="date" value={ab} onChange={(e) => setAb(e.target.value)} />
          </label>
          <label>
            <span>Betrag</span>
            <input
              className="wertfeld rechts"
              inputMode="decimal"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
              style={{ width: 90 }}
            />
          </label>
          <label className="breit">
            <span>Bemerkung</span>
            <input value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />
          </label>
          <button
            type="button"
            className="knopf"
            disabled={laeuft || betrag.trim() === "" || ab === ""}
            onClick={() => void hinzufuegen()}
          >
            {laeuft ? "Speichert ..." : "Preis eintragen"}
          </button>
        </div>
      )}
    </details>
  );
}
