/**
 * Wendet alle noch nicht angewendeten Migrationen an.
 *
 * Drizzle merkt sich in einer eigenen Tabelle, welche Dateien schon
 * gelaufen sind. Mehrfaches Ausfuehren ist deshalb gefahrlos.
 *
 *   npm run db:migrate -w @dels/api
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, datenbankSchliessen } from "./index.js";

const hier = path.dirname(fileURLToPath(import.meta.url));
const ordner = path.resolve(hier, "../../drizzle");

try {
  console.log("Wende Migrationen an ...");
  await migrate(db, { migrationsFolder: ordner });
  console.log("Fertig.");
} catch (fehler) {
  console.error("Migration fehlgeschlagen:", fehler);
  process.exitCode = 1;
} finally {
  await datenbankSchliessen();
}
