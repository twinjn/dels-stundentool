import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Alles, was im Browser an /api geht, leitet Vite im Hintergrund an
    // die Express-API weiter. Fuer den Browser sieht es damit so aus, als
    // kaeme alles vom selben Server. Genau so laeuft es spaeter auch in
    // Produktion, wo Express die gebaute Oberflaeche selbst ausliefert.
    // Vorteil: keine CORS-Sonderfaelle und Session-Cookies funktionieren
    // ohne Tricks.
    //
    // Ziel ist bewusst 127.0.0.1 und nicht localhost. Unter Windows loest
    // localhost zuerst nach ::1 auf, die API lauscht aber standardmaessig
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
});
