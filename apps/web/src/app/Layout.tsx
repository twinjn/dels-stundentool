/**
 * Rahmen der Anwendung: Seitenleiste mit Navigation, Kopfzeile, Inhalt.
 *
 * Was in der Navigation steht, hängt an den Rechten. Zur Erinnerung:
 * das ist Aufräumen, keine Sicherheit. Wer /benutzer von Hand eintippt,
 * sieht die Seite, aber die API liefert ihm nichts.
 */
import { NavLink, Outlet } from "react-router-dom";
import { hatRecht } from "@dels/shared";
import delsLogo from "../assets/dels-logo.png";
import { useAuth } from "./AuthKontext.js";

type Eintrag = { pfad: string; text: string; recht?: Parameters<typeof hatRecht>[1] };

const NAVIGATION: Eintrag[] = [
  { pfad: "/", text: "Übersicht", recht: "stunden:lesen" },
  { pfad: "/stunden", text: "Stunden", recht: "stunden:lesen" },
  { pfad: "/uebersicht", text: "Jahr", recht: "stunden:lesen" },
  { pfad: "/ferien", text: "Ferien", recht: "stammdaten:lesen" },
  { pfad: "/mitarbeiter", text: "Mitarbeiter", recht: "stammdaten:lesen" },
  { pfad: "/objekte", text: "Objekte", recht: "stammdaten:lesen" },
  { pfad: "/kalkulation", text: "Kalkulation", recht: "kalkulation:lesen" },
  { pfad: "/benutzer", text: "Benutzer", recht: "benutzer:verwalten" },
  { pfad: "/protokoll", text: "Protokoll", recht: "benutzer:verwalten" },
];

export function Layout() {
  const { benutzer, abmelden } = useAuth();
  if (!benutzer) return null;

  const sichtbar = NAVIGATION.filter((e) => !e.recht || hatRecht(benutzer.rolle, e.recht));

  return (
    <div className="rahmen">
      <aside className="seitenleiste">
        <div className="marke">
          <img src={delsLogo} alt="DELS Reinigung &amp; Beratung" />
        </div>
        <nav>
          {sichtbar.map((eintrag) => (
            <NavLink
              key={eintrag.pfad}
              to={eintrag.pfad}
              // Ohne "end" wäre "/" auf jeder Unterseite als aktiv markiert,
              // weil jeder Pfad mit "/" anfängt.
              end={eintrag.pfad === "/"}
              className={({ isActive }) => (isActive ? "navlink aktiv" : "navlink")}
            >
              {eintrag.text}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="hauptbereich">
        <header className="kopfleiste">
          <span className="benutzername">
            {benutzer.name} <span className="rollenschild">{benutzer.rolle}</span>
          </span>
          <NavLink to="/passwort" className="knopf-leise">
            Passwort
          </NavLink>
          <button className="knopf-leise" onClick={() => void abmelden()}>
            Abmelden
          </button>
        </header>

        <main className="inhalt">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
