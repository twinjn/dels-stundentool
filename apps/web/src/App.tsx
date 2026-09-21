/**
 * Einstieg der Oberflaeche.
 *
 * Drei Zustaende: wir wissen es noch nicht, niemand ist angemeldet,
 * jemand ist angemeldet. Das richtige Menue mit mehreren Seiten kommt in
 * Phase 3, wenn es etwas zu navigieren gibt.
 */
import { useEffect, useState } from "react";
import { hatRecht, RECHTE } from "@dels/shared";
import { api } from "./api/client.js";
import { AuthAnbieter, useAuth } from "./app/AuthKontext.js";
import { Anmeldung } from "./features/anmeldung/Anmeldung.js";

export default function App() {
  return (
    <AuthAnbieter>
      <Inhalt />
    </AuthAnbieter>
  );
}

function Inhalt() {
  const { benutzer, laedt, serverfehler } = useAuth();

  if (laedt) {
    return <p className="mittig">Einen Moment ...</p>;
  }

  if (serverfehler) {
    return (
      <main className="seite">
        <section className="karte">
          <h2>Kein Zugriff auf den Server</h2>
          <p className="status status-rot">{serverfehler}</p>
          <p className="hinweis">
            Laeuft die API? Starten mit <code>npm run dev</code>.
          </p>
        </section>
      </main>
    );
  }

  return benutzer ? <Angemeldet /> : <Anmeldung />;
}

type Health = {
  status: string;
  datenbank: boolean;
  umgebung: string;
  zeit: string;
};

function Angemeldet() {
  const { benutzer, abmelden } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    api
      .get<Health>("/health")
      .then((d) => {
        if (!abgebrochen) setHealth(d);
      })
      .catch(() => {
        /* Die Statusanzeige ist Beiwerk, ein Fehler hier stoert nicht. */
      });
    return () => {
      abgebrochen = true;
    };
  }, []);

  if (!benutzer) return null;

  const meineRechte = RECHTE.filter((r) => hatRecht(benutzer.rolle, r));

  return (
    <main className="seite">
      <header className="kopfzeile">
        <div>
          <h1>DELS Stundentool</h1>
          <p className="unterzeile">
            {benutzer.name} &middot; {benutzer.rolle}
          </p>
        </div>
        <button className="knopf-leise" onClick={() => void abmelden()}>
          Abmelden
        </button>
      </header>

      <section className="karte">
        <h2>Deine Rechte</h2>
        <p className="hinweis">
          Aus deiner Rolle <strong>{benutzer.rolle}</strong> ergeben sich {meineRechte.length} von{" "}
          {RECHTE.length} moeglichen Rechten. Der Server prueft sie bei jeder Anfrage erneut.
        </p>
        <ul className="rechteliste">
          {meineRechte.map((recht) => (
            <li key={recht}>{recht}</li>
          ))}
        </ul>
      </section>

      <section className="karte">
        <h2>Systemstatus</h2>
        {health ? (
          <dl className="werte">
            <dt>API</dt>
            <dd className={health.status === "ok" ? "status-gruen" : "status-rot"}>
              {health.status}
            </dd>
            <dt>Datenbank</dt>
            <dd className={health.datenbank ? "status-gruen" : "status-rot"}>
              {health.datenbank ? "erreichbar" : "nicht erreichbar"}
            </dd>
            <dt>Umgebung</dt>
            <dd>{health.umgebung}</dd>
          </dl>
        ) : (
          <p className="hinweis">Status wird geladen ...</p>
        )}
      </section>
    </main>
  );
}
