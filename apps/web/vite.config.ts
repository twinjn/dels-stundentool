import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Alles, was im Browser an /api geht, leitet Vite im Hintergrund an
    // die Express-API weiter. Für den Browser sieht es damit so aus, als
    // käme alles vom selben Server. Genau so läuft es später auch in
    // Produktion, wo Express die gebaute Oberfläche selbst ausliefert.
    // Vorteil: keine CORS-Sonderfälle und Session-Cookies funktionieren
    // ohne Tricks.
    //
    // Ziel ist bewusst 127.0.0.1 und nicht localhost. Unter Windows löst
    // localhost zuerst nach ::1 auf, die API lauscht aber standardmässig
    // nur auf 127.0.0.1. Node probiert zwar beide Adressen durch, das
    // kostet aber bei jeder Anfrage einen Fehlversuch. Die IP direkt
    // hinzuschreiben spart das.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },

  /**
   * Tests der Oberflaeche.
   *
   * WARUM ES DIE HIER BRAUCHT, obwohl die API 243 Tests hat: Die API
   * kann korrekt antworten und die Seite trotzdem das Falsche zeigen.
   * Zwei Fälle sind in diesem Projekt genau so passiert.
   *
   * Beim Passwortaendern war die Erfolgsmeldung nie zu sehen, weil die
   * Anwendung im selben Moment auf "nicht angemeldet" sprang und die
   * ganze Oberfläche gegen die Anmeldemaske tauschte. Tests grün,
   * Typecheck grün, Funktion kaputt.
   *
   * Auf der Ferienseite stand ein hochgerechneter Saldo von 96 Tagen
   * fett und unkommentiert da. Die Zahl war richtig gerechnet und die
   * Anzeige trotzdem irreführend.
   *
   * Beides fällt nur auf, wenn jemand hinschaut. Genau das machen
   * diese Tests, nur automatisch.
   *
   * jsdom baut einen Browser ohne Fenster nach: Dokument, Ereignisse,
   * Formulare. Kein echter Browser, aber genug, um zu prüfen, was
   * gerendert wird und was auf einen Klick passiert.
   */
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/aufbau.ts"],
    css: false,
  },
});
