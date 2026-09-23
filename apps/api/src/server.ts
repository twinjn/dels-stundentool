/**
 * Startet die API.
 * Einzige Datei, die wirklich einen Port belegt.
 */
import { baueApp } from "./app.js";
import { config, istProduktion } from "./config.js";
import { datenbankErreichbar } from "./db/index.js";

/**
 * Das Sitzungs-Cookie ist in Produktion "secure", wird also nur ueber
 * HTTPS geschickt. Laeuft die Anwendung dort ueber reines http, nimmt der
 * Browser das Cookie zwar entgegen, schickt es aber nie zurueck: die
 * Anmeldung scheint zu klappen und man ist sofort wieder abgemeldet.
 *
 * Das ist einer der Fehler, die man stundenlang sucht. Deshalb hier eine
 * unuebersehbare Warnung statt eines stillen Raetsels.
 */
if (istProduktion && config.WEB_ORIGIN.startsWith("http://")) {
  console.warn(
    "\n!! WEB_ORIGIN zeigt auf http:// statt https://." +
      "\n!! In Produktion wird das Sitzungs-Cookie nur über HTTPS geschickt." +
      "\n!! Die Anmeldung wird deshalb NICHT funktionieren." +
      "\n!! Entweder TLS davorschalten oder NODE_ENV auf development setzen.\n",
  );
}

// Eine Anwendung ohne Datenbank ist keine Anwendung. Lieber beim Start
// merken als beim ersten Benutzer.
if (!(await datenbankErreichbar())) {
  console.error(
    "\nDie Datenbank ist nicht erreichbar." +
      "\nDATABASE_URL prüfen und sicherstellen, dass Postgres läuft.\n",
  );
  process.exit(1);
}

const app = baueApp();

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`API läuft auf http://${config.HOST}:${config.PORT}  (${config.NODE_ENV})`);
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
