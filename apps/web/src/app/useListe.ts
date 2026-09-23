/**
 * Laedt eine Liste von der API und hält Ladezustand und Fehler fest.
 *
 * Fast jede Seite braucht genau das. Ohne diesen Haken stünden in jeder
 * Komponente dieselben drei useState und derselbe useEffect.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiFehler, api } from "../api/client.js";

export type Ladezustand<T> = {
  daten: T[];
  laedt: boolean;
  fehler: string | null;
  neuLaden: () => void;
};

export function useListe<T>(pfad: string): Ladezustand<T> {
  const [daten, setDaten] = useState<T[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zaehler, setZaehler] = useState(0);

  const neuLaden = useCallback(() => setZaehler((z) => z + 1), []);

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);

    api
      .get<T[]>(pfad)
      .then((liste) => {
        if (!abgebrochen) {
          setDaten(liste);
          setFehler(null);
        }
      })
      .catch((e: unknown) => {
        if (!abgebrochen) {
          setFehler(e instanceof ApiFehler ? e.message : "Laden fehlgeschlagen.");
        }
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });

    return () => {
      abgebrochen = true;
    };
  }, [pfad, zaehler]);

  return { daten, laedt, fehler, neuLaden };
}
