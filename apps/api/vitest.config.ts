import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * Testdateien laufen nacheinander, nicht parallel.
     *
     * Grund: alle teilen sich EINE Datenbank. Parallel wuerde eine Datei
     * Zeilen anlegen, zaehlen oder aufraeumen, waehrend eine andere
     * dasselbe tut. Solche Tests schlagen dann mal fehl und mal nicht,
     * je nach Laune des Rechners, und niemand findet die Ursache.
     *
     * Der Preis sind ein paar Sekunden Laufzeit. Bei dieser Groesse ist
     * das der richtige Tausch: verlaessliche Tests sind mehr wert als
     * schnelle.
     */
    fileParallelism: false,
  },
});
