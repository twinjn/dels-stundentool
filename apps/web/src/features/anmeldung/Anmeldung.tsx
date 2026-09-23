/**
 * Anmeldemaske.
 *
 * Geprüft wird mit demselben Zod-Schema, das der Server benutzt. Der
 * Unterschied: hier dient es der Bequemlichkeit (sofortige Rueckmeldung),
 * beim Server der Sicherheit.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { AnmeldungSchema } from "@dels/shared";
import delsLogo from "../../assets/dels-logo.png";
import { ApiFehler } from "../../api/client.js";
import { useAuth } from "../../app/AuthKontext.js";

export function Anmeldung() {
  const { anmelden } = useAuth();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    setFehler(null);

    const geprueft = AnmeldungSchema.safeParse({ email, passwort });
    if (!geprueft.success) {
      setFehler(geprueft.error.issues[0]?.message ?? "Eingabe ist unvollständig.");
      return;
    }

    setLaeuft(true);
    try {
      await anmelden(geprueft.data.email, geprueft.data.passwort);
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <main className="anmeldeseite">
      <form className="anmeldekarte" onSubmit={absenden} noValidate>
        <img className="anmeldelogo" src={delsLogo} alt="DELS Reinigung &amp; Beratung" />
        <h1>Stundentool</h1>
        <p className="unterzeile">Bitte anmelden</p>

        <label htmlFor="email">E-Mail</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={laeuft}
          autoFocus
        />

        <label htmlFor="passwort">Passwort</label>
        <input
          id="passwort"
          type="password"
          autoComplete="current-password"
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
          disabled={laeuft}
        />

        {/* role="alert" sorgt dafuer, dass Screenreader die Meldung
            vorlesen, sobald sie erscheint. */}
        {fehler && (
          <p className="fehlermeldung" role="alert">
            {fehler}
          </p>
        )}

        <button type="submit" disabled={laeuft}>
          {laeuft ? "Einen Moment ..." : "Anmelden"}
        </button>
      </form>
    </main>
  );
}
