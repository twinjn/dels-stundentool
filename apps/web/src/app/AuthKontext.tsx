/**
 * Wer ist angemeldet? Diese Frage stellt sich in fast jeder Komponente.
 *
 * Statt die Antwort durch den ganzen Komponentenbaum durchzureichen,
 * liegt sie in einem React-Kontext. Jede Komponente fragt mit useAuth()
 * direkt nach.
 *
 * WICHTIG: das hier ist Bequemlichkeit, keine Sicherheit. Der Zustand
 * lebt im Browser und laesst sich manipulieren. Wer hier "rolle: admin"
 * hineinschreibt, sieht Knoepfe, aber die API lehnt ihn trotzdem ab.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Rolle } from "@dels/shared";
import { ApiFehler, api } from "../api/client.js";

export type Benutzer = {
  id: string;
  name: string;
  email: string;
  rolle: Rolle;
};

type AuthZustand = {
  benutzer: Benutzer | null;
  /** true, solange wir noch nicht wissen, ob jemand angemeldet ist. */
  laedt: boolean;
  /** Gesetzt, wenn der Server gar nicht erreichbar ist. */
  serverfehler: string | null;
  anmelden: (email: string, passwort: string) => Promise<void>;
  abmelden: () => Promise<void>;
  /**
   * Nur den Browserzustand auf "abgemeldet" setzen, ohne den Server zu
   * fragen. Gebraucht nach einer Passwortaenderung: der Server hat die
   * Sitzung dabei schon beendet, ein zusaetzliches /auth/abmelden
   * bekaeme nur ein 401 zurueck.
   */
  abgemeldet: () => void;
};

/**
 * Exportiert, damit Tests ihn direkt fuellen koennen.
 *
 * Im Anwendungscode benutzt man useAuth() und nie diesen Kontext.
 * Tests brauchen ihn trotzdem: wuerden sie den echten AuthAnbieter
 * verwenden, fragte der beim Start /auth/ich ab, und jeder Test haette
 * eine Ladephase, die mit seiner eigentlichen Frage nichts zu tun hat.
 */
export const AuthKontext = createContext<AuthZustand | null>(null);

export function AuthAnbieter({ children }: { children: ReactNode }) {
  const [benutzer, setBenutzer] = useState<Benutzer | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [serverfehler, setServerfehler] = useState<string | null>(null);

  // Beim Laden der Seite einmal fragen: gilt mein Cookie noch?
  useEffect(() => {
    let abgebrochen = false;

    api
      .get<Benutzer>("/auth/ich")
      .then((daten) => {
        if (!abgebrochen) setBenutzer(daten);
      })
      .catch((fehler: unknown) => {
        if (abgebrochen) return;
        // 401 ist hier kein Fehler, sondern die normale Antwort fuer
        // "noch nicht angemeldet".
        if (fehler instanceof ApiFehler && !fehler.istNichtAngemeldet) {
          setServerfehler(fehler.message);
        }
        setBenutzer(null);
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });

    return () => {
      abgebrochen = true;
    };
  }, []);

  const anmelden = useCallback(async (email: string, passwort: string) => {
    const daten = await api.post<Benutzer>("/auth/anmelden", { email, passwort });
    setServerfehler(null);
    setBenutzer(daten);
  }, []);

  const abmelden = useCallback(async () => {
    try {
      await api.post("/auth/abmelden");
    } finally {
      // Auch wenn der Server nicht antwortet: im Browser gilt man als
      // abgemeldet. Alles andere waere verwirrend.
      setBenutzer(null);
    }
  }, []);

  const abgemeldet = useCallback(() => {
    setBenutzer(null);
  }, []);

  const wert = useMemo(
    () => ({ benutzer, laedt, serverfehler, anmelden, abmelden, abgemeldet }),
    [benutzer, laedt, serverfehler, anmelden, abmelden, abgemeldet],
  );

  return <AuthKontext.Provider value={wert}>{children}</AuthKontext.Provider>;
}

export function useAuth(): AuthZustand {
  const wert = useContext(AuthKontext);
  if (!wert) {
    throw new Error("useAuth wurde ausserhalb von <AuthAnbieter> benutzt.");
  }
  return wert;
}
