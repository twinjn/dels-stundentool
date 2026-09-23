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
  return u.art === "person_fehlt" ? `${u.art}:${u.mitarbeiterId}` : `${u.art}:${u.objektId}`;
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
    case "person_fehlt":
      return `hat ${u.stunden} Std. erfasst, steht aber nicht in der Personalliste des Monats`;
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
    case "person_fehlt":
      return "wird in die Personalliste aufgenommen";
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
    () => new Set(bericht.unterschiede.map(schluesselVon)),
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
              return (
                <tr key={schluessel}>
                  <td>
                    <input
                      type="checkbox"
                      checked={gewaehlt.has(schluessel)}
                      disabled={gesperrt}
                      onChange={() => umschalten(schluessel)}
                      aria-label={`${u.name} übernehmen`}
                    />
                  </td>
                  <td>
                    <span className="objektnr">
                      {u.art === "person_fehlt" ? (u.personalnummer ?? "") : (u.objektNr ?? "")}
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
