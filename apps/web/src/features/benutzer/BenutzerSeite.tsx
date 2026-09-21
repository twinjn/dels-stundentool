/**
 * Benutzerverwaltung. Nur fuer Admins sichtbar und nur fuer Admins nutzbar.
 *
 * Zur Erinnerung: dass diese Seite in der Navigation fehlt, hindert
 * niemanden daran, /benutzer einzutippen. Geschuetzt ist sie dadurch,
 * dass die API jede Anfrage prueft.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { MINDESTLAENGE_PASSWORT, ROLLEN } from "@dels/shared";
import type { Rolle } from "@dels/shared";
import { ApiFehler, api } from "../../api/client.js";
import { useAuth } from "../../app/AuthKontext.js";
import { useListe } from "../../app/useListe.js";
import { Feld } from "../../components/Feld.js";

type BenutzerZeile = {
  id: string;
  name: string;
  email: string;
  rolle: Rolle;
  aktiv: boolean;
  letzterLoginAm: string | null;
};

export function BenutzerSeite() {
  const { benutzer: ich } = useAuth();
  const { daten, laedt, fehler, neuLaden } = useListe<BenutzerZeile>("/benutzer");
  const [zeigeNeu, setZeigeNeu] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [aktionsfehler, setAktionsfehler] = useState<string | null>(null);

  async function umschalten(zeile: BenutzerZeile) {
    setAktionsfehler(null);
    setMeldung(null);
    try {
      await api.patch(`/benutzer/${zeile.id}`, { aktiv: !zeile.aktiv });
      neuLaden();
    } catch (e: unknown) {
      // Haeufigster Fall: es ist der letzte aktive Admin.
      setAktionsfehler(e instanceof ApiFehler ? e.message : "Aenderung fehlgeschlagen.");
    }
  }

  async function rolleAendern(zeile: BenutzerZeile, rolle: Rolle) {
    setAktionsfehler(null);
    setMeldung(null);
    try {
      await api.patch(`/benutzer/${zeile.id}`, { rolle });
      neuLaden();
    } catch (e: unknown) {
      setAktionsfehler(e instanceof ApiFehler ? e.message : "Aenderung fehlgeschlagen.");
    }
  }

  return (
    <div className="seite-schmal">
      <div className="seitenkopf">
        <h1>Benutzer</h1>
        <button className="knopf" onClick={() => setZeigeNeu((z) => !z)}>
          {zeigeNeu ? "Abbrechen" : "Neu"}
        </button>
      </div>

      <p className="hinweis">
        Benutzer werden nie geloescht, sondern stillgelegt. So bleibt nachvollziehbar, wer frueher
        welche Aenderung gemacht hat.
      </p>

      {zeigeNeu && (
        <NeuerBenutzer
          onFertig={(name) => {
            setZeigeNeu(false);
            setMeldung(`${name} wurde angelegt.`);
            neuLaden();
          }}
        />
      )}

      {meldung && <p className="erfolgsmeldung">{meldung}</p>}
      {aktionsfehler && (
        <p className="fehlermeldung" role="alert">
          {aktionsfehler}
        </p>
      )}
      {fehler && <p className="status status-rot">{fehler}</p>}
      {laedt && <p className="hinweis">Wird geladen ...</p>}

      {daten.length > 0 && (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Rolle</th>
              <th>Letzte Anmeldung</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {daten.map((zeile) => (
              <tr key={zeile.id} className={zeile.aktiv ? "" : "inaktiv"}>
                <td>
                  {zeile.name}
                  {zeile.id === ich?.id && <span className="schild">du</span>}
                  {!zeile.aktiv && <span className="schild">stillgelegt</span>}
                </td>
                <td>{zeile.email}</td>
                <td>
                  <select
                    value={zeile.rolle}
                    aria-label={`Rolle von ${zeile.name}`}
                    onChange={(e) => void rolleAendern(zeile, e.target.value as Rolle)}
                  >
                    {ROLLEN.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {zeile.letzterLoginAm
                    ? new Date(zeile.letzterLoginAm).toLocaleDateString("de-CH")
                    : "nie"}
                </td>
                <td className="rechts">
                  <button className="knopf-leise" onClick={() => void umschalten(zeile)}>
                    {zeile.aktiv ? "Stilllegen" : "Aktivieren"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NeuerBenutzer({ onFertig }: { onFertig: (name: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [rolle, setRolle] = useState<Rolle>("buero");
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldfehler, setFeldfehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);

  async function anlegen(ereignis: FormEvent) {
    ereignis.preventDefault();
    setFehler(null);
    setFeldfehler({});
    setLaeuft(true);

    try {
      await api.post("/benutzer", { name, email, passwort, rolle });
      onFertig(name);
    } catch (e: unknown) {
      if (e instanceof ApiFehler) {
        setFehler(e.message);
        setFeldfehler(Object.fromEntries(e.felder.map((f) => [f.feld, f.problem])));
      } else {
        setFehler("Anlegen fehlgeschlagen.");
      }
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <form className="formular" onSubmit={anlegen} noValidate>
      <h2>Neuer Benutzer</h2>

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}

      <div className="feldraster">
        <Feld
          id="b-name"
          beschriftung="Name"
          wert={name}
          onChange={setName}
          fehler={feldfehler.name}
        />
        <Feld
          id="b-email"
          beschriftung="E-Mail"
          typ="email"
          wert={email}
          onChange={setEmail}
          fehler={feldfehler.email}
        />
        <Feld
          id="b-passwort"
          beschriftung="Passwort"
          typ="password"
          wert={passwort}
          onChange={setPasswort}
          hinweis={`Mindestens ${MINDESTLAENGE_PASSWORT} Zeichen. Ein Satz ist besser als Sonderzeichen.`}
          fehler={feldfehler.passwort}
        />
        <div className="feld">
          <label htmlFor="b-rolle">Rolle</label>
          <select id="b-rolle" value={rolle} onChange={(e) => setRolle(e.target.value as Rolle)}>
            {ROLLEN.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span className="feldhinweis">
            {rolle === "admin"
              ? "Sieht alles, auch Loehne und Kalkulation."
              : "Stunden und Stammdaten, keine Loehne."}
          </span>
        </div>
      </div>

      <div className="formularfuss">
        <button type="submit" className="knopf" disabled={laeuft}>
          {laeuft ? "Legt an ..." : "Anlegen"}
        </button>
      </div>
    </form>
  );
}
