/**
 * Konfiguration für drizzle-kit, das Werkzeug, das aus src/db/schema.ts
 * die SQL-Migrationen erzeugt.
 *
 *   npm run db:generate -w @dels/api    Migration aus dem Schema erzeugen
 *   npm run db:migrate  -w @dels/api    Migrationen auf die DB anwenden
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const hier = path.dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(path.resolve(hier, "../../.env"));
} catch {
  // In der CI kommen die Werte aus der Umgebung.
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL fehlt. Siehe .env.example.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  // Erzeugt lesbare Namen statt Zufallsnamen für Migrationsdateien.
  verbose: true,
  strict: true,
});
