import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const hier = path.dirname(fileURLToPath(import.meta.url));

/**
 * Tests laufen gegen eine EIGENE Datenbank.
 *
 * Steht TEST_DATABASE_URL in der .env, wird sie hier vor allen anderen
 * Modulen gesetzt und überschreibt DATABASE_URL für diesen Lauf. So
 * muss niemand daran denken, vor jedem Testlauf etwas umzustellen, und
 * die Entwicklungsdaten bleiben unberuehrt.
 *
 * In der CI kommt DATABASE_URL ohnehin schon aus dem Workflow und zeigt
 * auf dels_test.
 */
try {
  process.loadEnvFile(path.resolve(hier, "../../.env"));
} catch {
  // Keine .env: in der CI kommt alles aus der Umgebung.
}

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    /**
     * Testdateien laufen nacheinander, nicht parallel.
     *
     * Grund: alle teilen sich EINE Datenbank. Parallel würde eine Datei
     * Zeilen anlegen, zählen oder aufräumen, während eine andere
     * dasselbe tut. Solche Tests schlagen dann mal fehl und mal nicht,
     * je nach Laune des Rechners, und niemand findet die Ursache.
     */
    fileParallelism: false,
  },
});
