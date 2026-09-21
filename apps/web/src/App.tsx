/**
 * Einstieg und Wegweiser der Oberflaeche.
 */
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthAnbieter, useAuth } from "./app/AuthKontext.js";
import { Layout } from "./app/Layout.js";
import { Anmeldung } from "./features/anmeldung/Anmeldung.js";
import { BenutzerSeite } from "./features/benutzer/BenutzerSeite.js";
import { MitarbeiterSeite } from "./features/mitarbeiter/MitarbeiterSeite.js";
import { ObjekteSeite } from "./features/objekte/ObjekteSeite.js";

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

  if (!benutzer) {
    return <Anmeldung />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/mitarbeiter" element={<MitarbeiterSeite />} />
          <Route path="/objekte" element={<ObjekteSeite />} />
          <Route path="/benutzer" element={<BenutzerSeite />} />
          {/* Alles Unbekannte landet auf der Startseite statt im Nichts. */}
          <Route path="*" element={<Navigate to="/mitarbeiter" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
