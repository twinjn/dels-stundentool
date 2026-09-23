/**
 * Kommandozeilen-Werkzeug fuer den Import aus dem Altsystem.
 *
 *   npm run db:import -w @dels/api              importiert
 *   npm run db:import -w @dels/api -- --leeren  leert die Zieltabellen vorher
 *
 * Die Zugangszeichenfolge zur alten Datenbank steht als
 * SUPABASE_DATABASE_URL in der .env. Sie steht NICHT im Repository.
 */
import { erstellePool, datenbankSchliessen, pool } from "./index.js";
import { ZU_LEEREN, importiere, zielBestand } from "./import.js";

const quellUrl = process.env.SUPABASE_DATABASE_URL;

if (!quellUrl) {
  console.error(`
SUPABASE_DATABASE_URL fehlt in der .env.

So kommst du an den Wert:
  1. supabase.com oeffnen, dein Projekt waehlen
  2. Connect (oben rechts) oder Project Settings, Bereich Database
  3. Connection string, Variante "URI", kopieren
  4. [YOUR-PASSWORD] durch dein Datenbankpasswort ersetzen
  5. In die .env eintragen als SUPABASE_DATABASE_URL=...

Der Wert enthaelt ein Passwort. Er gehoert nur in die .env, niemals
in einen Commit und niemals in eine Chatnachricht.
`);
  process.exit(1);
}

const leeren = process.argv.includes("--leeren");
const quelle = erstellePool(quellUrl);

try {
  const vorher = await zielBestand(pool);
  const belegt = Object.entries(vorher).filter(([, anzahl]) => anzahl > 0);

  if (belegt.length > 0 && !leeren) {
    console.error("\nIn der Zieldatenbank stehen schon Daten:\n");
    for (const [tabelle, anzahl] of belegt) {
      console.error(`  ${tabelle}: ${anzahl}`);
    }
    console.error(
      "\nDer Import wuerde an den Primaerschluesseln scheitern." +
        "\nEntweder die Tabellen von Hand bereinigen oder so aufrufen:" +
        "\n  npm run db:import -w @dels/api -- --leeren\n",
    );
    process.exit(1);
  }

  if (leeren) {
    console.log("Leere die Zieltabellen ...");
    // Welche Tabellen und warum: siehe ZU_LEEREN in import.ts.
    await pool.query(`truncate table ${ZU_LEEREN.join(", ")} restart identity`);
  }

  console.log("Importiere ...");
  const bericht = await importiere(quelle, pool);

  console.log("\nUebernommen:");
  let summe = 0;
  for (const [tabelle, anzahl] of Object.entries(bericht)) {
    console.log(`  ${tabelle.padEnd(20)} ${String(anzahl).padStart(6)}`);
    summe += anzahl;
  }
  console.log(`  ${"gesamt".padEnd(20)} ${String(summe).padStart(6)}\n`);
} catch (fehler) {
  console.error("\nImport fehlgeschlagen, es wurde nichts uebernommen:\n", fehler);
  process.exitCode = 1;
} finally {
  await quelle.end();
  await datenbankSchliessen();
}
