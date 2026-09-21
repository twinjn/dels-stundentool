/**
 * Datenbankverbindung.
 *
 * Ein Pool statt einzelner Verbindungen: Verbindungen aufzubauen ist teuer,
 * der Pool haelt eine Handvoll offen und teilt sie zwischen Anfragen.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

/**
 * WICHTIG, und der Grund fuer viele "um einen Tag verschobene" Fehler:
 *
 * Standardmaessig macht der Postgres-Treiber aus einer "date"-Spalte ein
 * JavaScript-Date-Objekt. Das hat aber immer auch eine Uhrzeit und eine
 * Zeitzone. Aus dem 1. Februar wird dann je nach Zeitzone der 31. Januar
 * um 23 Uhr. In einer Stundenerfassung heisst das: eine Schicht rutscht in
 * den Vormonat und taucht in der falschen Lohnabrechnung auf.
 *
 * Ein Datum ohne Uhrzeit hat keine Zeitzone. Deshalb lassen wir es als
 * Zeichenkette "YYYY-MM-DD", genau so, wie es in der Datenbank steht.
 *
 * 1082 ist die Typnummer von "date" in Postgres.
 */
pg.types.setTypeParser(1082, (wert) => wert);

/**
 * Der einzige Weg, einen Verbindungspool zu bauen.
 *
 * Es gibt diese Funktion, weil die Datumseinstellung oben global gilt,
 * aber nur dann, wenn diese Datei ueberhaupt geladen wurde. Wer sich
 * anderswo schnell selbst ein "new pg.Pool(...)" baut, bekommt die
 * Einstellung unter Umstaenden nicht mit und handelt sich die
 * Datumsverschiebung wieder ein. Genau das ist beim ersten Entwurf des
 * Importtests passiert.
 *
 * Deshalb: Pools immer hierueber anlegen, nie direkt.
 */
export function erstellePool(verbindungszeichenfolge: string): pg.Pool {
  const neuerPool = new pg.Pool({
    connectionString: verbindungszeichenfolge,
    max: 10,
    // Verbindung nicht ewig offen halten, wenn nichts passiert.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Ein Fehler im Pool ohne Zuhoerer beendet sonst den ganzen Prozess.
  neuerPool.on("error", (fehler) => {
    console.error("Fehler in einer ungenutzten Datenbankverbindung:", fehler);
  });

  return neuerPool;
}

export const pool = erstellePool(config.DATABASE_URL);

export const db = drizzle(pool, { schema });

export type Datenbank = typeof db;

/** Kurzer Lebenstest fuer die Health-Route und das Startskript. */
export async function datenbankErreichbar(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export async function datenbankSchliessen(): Promise<void> {
  await pool.end();
}
