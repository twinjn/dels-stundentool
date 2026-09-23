/**
 * Abgleich zwischen Stammdaten und dem geöffneten Kalkulationsmonat.
 *
 * WARUM DAS EIN KASTEN IST UND KEINE AUTOMATIK:
 *
 * Ein Kalkulationsmonat hält seine Abo-Beträge selbst fest. Das muss
 * er, sonst schriebe jede Preiserhöhung still die ganze Vergangenheit
 * um. Der Preis dafür ist, dass er mit der Zeit von den Stammdaten
 * abdriftet, und zwar lautlos: ein neu angelegtes Objekt fehlt im Monat
 * einfach, ohne Warnung, ohne Zeile, ohne Zahl.
 *
 * Dieser Kasten macht genau diese Lücke sichtbar und lässt sie in einem
 * Schritt schliessen. Was übernommen wird, entscheidet der Mensch.
 */
import { useState } from "react";
import { chf } from "@dels/shared";
import { ApiFehler, api } from "../../api/client.js";
import type { Abgleichsbericht, Unterschied } from "./typen.js";

export function schluesselVon(u: Unterschied): string {
  return "mitarbeiterId" in u ? `${u.art}:${u.mitarbeiterId}` : `${u.art}:${u.objektId}`;
}

/**
 * Punkte, die sich auf Knopfdruck beheben lassen.
 *
 * Gleiche Regel wie auf dem Server. Ein doppelt gezählter Mensch braucht
 * eine Entscheidung, die nicht in den Daten steht, deshalb bekommt er
 * kein Kästchen, sondern nur eine Zeile, die sagt, was los ist.
 */
export function behebbar(u: Unterschied): boolean {
  return u.art !== "person_doppelt";
}

function beschreibe(u: Unterschied): string {
  switch (u.art) {
    case "objekt_fehlt":
      return u.stunden > 0
        ? `fehlt in diesem Monat, obwohl darauf ${u.stunden} Std. gebucht sind`
        : `ist neu und fehlt in diesem Monat`;
    case "abo_weicht_ab":
      return `Abo ${chf(Number(u.imMonat ?? 0))} im Monat, ${chf(
        Number(u.lautStammdaten ?? 0),
      )} laut Stammblatt`;
    case "objekt_stillgelegt":
      return "ist im Stammblatt stillgelegt, zählt in diesem Monat aber noch mit";
    case "monatslohn_fehlt":
      return "ist Monatslöhner und fehlt in der Personalliste, sein Lohn ist gar nicht gerechnet";
    case "lohn_weicht_ab":
      return `Lohn ${chf(Number(u.imMonat ?? 0))} im Monat, ${chf(
        Number(u.lautStammdaten ?? 0),
      )} laut Stammblatt`;
    case "person_doppelt":
      return u.lohnart === "stunde"
        ? `ist Stundenlöhner mit ${u.stunden} Std. auf Objekten, steht aber auch in der Personalliste`
        : `ist Monatslöhner und hat zusätzlich ${u.stunden} Std. auf Objekte gebucht`;
  }
}

function wasPassiert(u: Unterschied): string {
  switch (u.art) {
    case "objekt_fehlt":
      return `wird mit ${chf(Number(u.abo ?? 0))} aufgenommen`;
    case "abo_weicht_ab":
      return `wird auf ${chf(Number(u.lautStammdaten ?? 0))} gesetzt`;
    case "objekt_stillgelegt":
      return "wird im Monat auf inaktiv gesetzt";
    case "monatslohn_fehlt":
      return `wird mit ${chf(Number(u.lautStammdaten ?? 0))} aufgenommen`;
    case "lohn_weicht_ab":
      return `wird auf ${chf(Number(u.lautStammdaten ?? 0))} gesetzt`;
    case "person_doppelt":
      return u.lohnart === "stunde"
        ? "Personalzeile prüfen: der Lohn zählt sonst zweimal"
        : "Erfassung prüfen: der Lohn zählt sonst zweimal";
  }
}

export function Abgleichskasten({
  bericht,
  gesperrt,
  onFertig,
}: {
  bericht: Abgleichsbericht;
  gesperrt: boolean;
  onFertig: () => void;
}) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(
    () => new Set(bericht.unterschiede.filter(behebbar).map(schluesselVon)),
  );
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Aufgeklappt, wenn es etwas zu zeigen gibt. Ein zugeklappter Kasten
  // mit einer Zahl darin ist genau die Art Hinweis, die man ein halbes
  // Jahr lang übersieht.
  const [offen, setOffen] = useState(true);

  if (bericht.unterschiede.length === 0) return null;

  function umschalten(schluessel: string) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (neu.has(schluessel)) neu.delete(schluessel);
      else neu.add(schluessel);
      return neu;
    });
  }

  async function uebernehmen() {
    setLaeuft(true);
    setFehler(null);
    try {
      await api.post(`/kalkulation/${bericht.monat}/abgleich`, {
        schluessel: [...gewaehlt],
      });
      onFertig();
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Übernehmen fehlgeschlagen.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <details className="abgleich" open={offen} onToggle={(e) => setOffen(e.currentTarget.open)}>
      <summary>
        {bericht.unterschiede.length} Unterschied(e) zwischen Stammdaten und diesem Monat
      </summary>

      <p className="hinweis">
        Der Monat hält seine Beträge selbst fest, damit sich alte Zahlen später wieder herstellen
        lassen. Deshalb wird hier nichts von allein übernommen. Was angehakt ist, wird beim Klick
        auf Übernehmen in den Monat geschrieben.
      </p>

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}

      <div className="abgleichliste">
        <table className="tabelle">
          <thead>
            <tr>
              <th />
              <th>Was</th>
              <th>Warum es auffällt</th>
              <th>Was passiert</th>
            </tr>
          </thead>
          <tbody>
            {bericht.unterschiede.map((u) => {
              const schluessel = schluesselVon(u);
              const machbar = behebbar(u);
              return (
                <tr key={schluessel} className={machbar ? "" : "nurhinweis"}>
                  <td>
                    {machbar ? (
                      <input
                        type="checkbox"
                        checked={gewaehlt.has(schluessel)}
                        disabled={gesperrt}
                        onChange={() => umschalten(schluessel)}
                        aria-label={`${u.name} übernehmen`}
                      />
                    ) : (
                      <span className="schild" title="Braucht eine Entscheidung">
                        !
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="objektnr">
                      {("mitarbeiterId" in u ? u.personalnummer : u.objektNr) ?? ""}
                    </span>{" "}
                    {u.name}
                  </td>
                  <td>{beschreibe(u)}</td>
                  <td>{wasPassiert(u)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {gesperrt ? (
        <p className="hinweis">
          Der Monat ist abgeschlossen. Zum Übernehmen muss er zuerst wieder geöffnet werden.
        </p>
      ) : (
        <button
          className="knopf"
          disabled={laeuft || gewaehlt.size === 0}
          onClick={() => void uebernehmen()}
        >
          {laeuft ? "Wird übernommen ..." : `${gewaehlt.size} Punkt(e) übernehmen`}
        </button>
      )}
    </details>
  );
}
