/**
 * Startet die API.
 * Einzige Datei, die wirklich einen Port belegt.
 */
import { baueApp } from "./app.js";
import { config } from "./config.js";

const app = baueApp();

const server = app.listen(config.PORT, () => {
  console.log(`API laeuft auf http://localhost:${config.PORT}  (${config.NODE_ENV})`);
});

/**
 * Sauberes Herunterfahren. Ohne das beendet Docker den Prozess hart und
 * Anfragen, die gerade mitten in einer Datenbank-Transaktion stecken,
 * brechen unkontrolliert ab.
 */
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} empfangen, fahre herunter ...`);
    server.close(() => process.exit(0));
    // Notbremse, falls eine Verbindung nicht freiwillig loslaesst.
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
