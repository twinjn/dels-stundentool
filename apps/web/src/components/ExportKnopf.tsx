/**
 * Knopf, der eine Datei vom Server holt.
 *
 * Während des Herunterladens ist er gesperrt: ein Export über ein
 * ganzes Jahr dauert einen Moment, und ohne Sperre klickt man dreimal
 * und bekommt dieselbe Datei dreimal.
 */
import { useState } from "react";
import { ApiFehler, api } from "../api/client.js";

export function ExportKnopf({
  pfad,
  beschriftung = "Als Excel",
  titel,
}: {
  pfad: string;
  beschriftung?: string;
  titel?: string;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function holen(): Promise<void> {
    setLaeuft(true);
    setFehler(null);
    try {
      await api.datei(pfad);
    } catch (e) {
      setFehler(e instanceof ApiFehler ? e.message : "Der Export ist fehlgeschlagen.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <span className="exportknopf">
      <button type="button" onClick={() => void holen()} disabled={laeuft} title={titel}>
        {laeuft ? "Wird erstellt…" : beschriftung}
      </button>
      {fehler && <span className="exportfehler">{fehler}</span>}
    </span>
  );
}

/**
 * Öffnet den Druckdialog des Browsers.
 *
 * Das ist der PDF-Weg dieser Anwendung: im Dialog "Als PDF speichern"
 * waehlen. Kein PDF-Erzeuger auf dem Server, dafür ein Stylesheet für
 * @media print, das Navigation und Bedienelemente wegnimmt und die
 * Tabellenkopfzeile auf jeder Seite wiederholt.
 */
export function DruckKnopf({ beschriftung = "Drucken / PDF" }: { beschriftung?: string }) {
  return (
    <span className="exportknopf">
      <button
        type="button"
        onClick={() => window.print()}
        title="Öffnet den Druckdialog. Dort 'Als PDF speichern' wählen."
      >
        {beschriftung}
      </button>
    </span>
  );
}
