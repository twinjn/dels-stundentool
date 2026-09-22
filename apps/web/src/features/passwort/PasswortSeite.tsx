/**
 * Eigenes Passwort aendern.
 *
 * WICHTIG FUER DIE BEDIENUNG: Der Server beendet dabei ALLE Sitzungen,
 * auch die eigene. Das ist Absicht und meist genau der Grund, warum
 * jemand sein Passwort aendert: weil vielleicht noch jemand anders
 * angemeldet ist. Die Seite sagt das vorher und schickt danach zurueck
 * zur Anmeldung, statt den Benutzer in eine Oberflaeche laufen zu
 * lassen, in der ploetzlich jede Anfrage mit 401 antwortet.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { MINDESTLAENGE_PASSWORT, PasswortAendernSchema } from "@dels/shared";
import { ApiFehler, api } from "../../api/client.js";
import { useAuth } from "../../app/AuthKontext.js";

export function PasswortSeite() {
  const { benutzer, abgemeldet } = useAuth();
  const [altesPasswort, setAltes] = useState("");
  const [neuesPasswort, setNeues] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    setFehler(null);

    if (neuesPasswort !== wiederholung) {
      setFehler("Die beiden neuen Passwoerter stimmen nicht ueberein.");
      return;
    }

    // Dasselbe Schema, das auch der Server benutzt. Hier nur fuer die
    // schnelle Rueckmeldung, die Sicherheit kommt vom Server.
    const geprueft = PasswortAendernSchema.safeParse({ altesPasswort, neuesPasswort });
    if (!geprueft.success) {
      setFehler(geprueft.error.issues[0]?.message ?? "Eingabe unvollstaendig.");
      return;
    }

    setLaeuft(true);
    try {
      await api.post("/auth/passwort", geprueft.data);
      setFertig(true);
      // Hier NICHT abgemeldet() aufrufen.
      //
      // Der Server hat die Sitzung zwar schon beendet. Sobald aber der
      // Browserzustand auf "nicht angemeldet" springt, tauscht die
      // Anwendung die ganze Oberflaeche gegen die Anmeldemaske. Die
      // Erfolgsmeldung waere dann nie zu sehen, und der Benutzer stuende
      // ohne Erklaerung wieder vor dem Anmeldebildschirm.
      //
      // Aufgefallen ist das erst beim Durchspielen im Browser: die
      // Aenderung ging durch, die Meldung erschien nie. Aufgeraeumt wird
      // deshalb erst mit dem Knopf auf der Erfolgsseite. Solange die
      // steht, wird ohnehin nichts vom Server geholt.
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Aendern fehlgeschlagen.");
    } finally {
      setLaeuft(false);
    }
  }

  if (fertig) {
    return (
      <div className="seite-schmal">
        <h1>Passwort geändert</h1>
        <p className="status status-gruen">
          Das Passwort ist gesetzt. Alle Anmeldungen wurden beendet, auch deine eigene. Bitte melde
          dich mit dem neuen Passwort wieder an.
        </p>
        <button className="knopf" onClick={abgemeldet}>
          Zur Anmeldung
        </button>
      </div>
    );
  }

  return (
    <div className="seite-schmal">
      <h1>Passwort ändern</h1>
      <p className="hinweis">
        Angemeldet als {benutzer?.email}. Nach dem Ändern wirst du abgemeldet, und zwar auf allen
        Geräten. Das ist Absicht.
      </p>

      <form className="passwortformular" onSubmit={absenden} noValidate>
        <label htmlFor="alt">Aktuelles Passwort</label>
        <input
          id="alt"
          type="password"
          autoComplete="current-password"
          value={altesPasswort}
          onChange={(e) => setAltes(e.target.value)}
          disabled={laeuft}
          autoFocus
        />

        <label htmlFor="neu">Neues Passwort</label>
        <input
          id="neu"
          type="password"
          autoComplete="new-password"
          value={neuesPasswort}
          onChange={(e) => setNeues(e.target.value)}
          disabled={laeuft}
        />
        <p className="hinweis">Mindestens {MINDESTLAENGE_PASSWORT} Zeichen.</p>

        <label htmlFor="wdh">Neues Passwort wiederholen</label>
        <input
          id="wdh"
          type="password"
          autoComplete="new-password"
          value={wiederholung}
          onChange={(e) => setWiederholung(e.target.value)}
          disabled={laeuft}
        />

        {fehler && (
          <p className="fehlermeldung" role="alert">
            {fehler}
          </p>
        )}

        <button className="knopf" type="submit" disabled={laeuft}>
          {laeuft ? "Wird geändert ..." : "Passwort ändern"}
        </button>
      </form>
    </div>
  );
}
