/**
 * Phase 0: bewusst eine Statusseite und noch keine Anwendung.
 *
 * Sie beweist drei Dinge auf einmal:
 *  1. Der Browser erreicht die API (ueber den Vite-Proxy).
 *  2. Das gemeinsame Paket @dels/shared ist im Browser nutzbar.
 *  3. Die Fehlerbehandlung greift, wenn die API nicht laeuft.
 */
import { useEffect, useState } from "react";
import { hatRecht, RECHTE, ROLLEN } from "@dels/shared";
import { ApiFehler, api } from "./api/client.js";

type Health = {
  status: string;
  umgebung: string;
  zeit: string;
  laufzeitSekunden: number;
};

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;

    api
      .get<Health>("/health")
      .then((daten) => {
        if (!abgebrochen) setHealth(daten);
      })
      .catch((e: unknown) => {
        if (abgebrochen) return;
        setFehler(e instanceof ApiFehler ? e.message : "Unbekannter Fehler.");
      });

    // Aufraeumen: verhindert, dass eine spaet eintreffende Antwort eine
    // Komponente aktualisiert, die es nicht mehr gibt.
    return () => {
      abgebrochen = true;
    };
  }, []);

  return (
    <main className="seite">
      <header className="kopf">
        <h1>DELS Stundentool</h1>
        <p className="unterzeile">Version 2 &middot; Fundament steht</p>
      </header>

      <section className="karte">
        <h2>Verbindung zur API</h2>
        {fehler && (
          <p className="status status-rot">
            {fehler} Laeuft die API? Starte sie mit <code>npm run dev</code>.
          </p>
        )}
        {!fehler && !health && <p className="status">Pruefe ...</p>}
        {health && (
          <dl className="werte">
            <dt>Status</dt>
            <dd className="status-gruen">{health.status}</dd>
            <dt>Umgebung</dt>
            <dd>{health.umgebung}</dd>
            <dt>Serverzeit</dt>
            <dd>{new Date(health.zeit).toLocaleString("de-CH")}</dd>
            <dt>Laufzeit</dt>
            <dd>{health.laufzeitSekunden} s</dd>
          </dl>
        )}
      </section>

      <section className="karte">
        <h2>Rechte je Rolle</h2>
        <p className="hinweis">
          Diese Tabelle kommt aus <code>@dels/shared</code> und ist dieselbe Quelle, die der Server
          zur Pruefung benutzt.
        </p>
        <table className="tabelle">
          <thead>
            <tr>
              <th>Recht</th>
              {ROLLEN.map((r) => (
                <th key={r}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECHTE.map((recht) => (
              <tr key={recht}>
                <td>{recht}</td>
                {ROLLEN.map((rolle) => (
                  <td key={rolle} className={hatRecht(rolle, recht) ? "ja" : "nein"}>
                    {hatRecht(rolle, recht) ? "ja" : "nein"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
