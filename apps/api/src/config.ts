/**
 * Konfiguration aus Umgebungsvariablen.
 *
 * Grundregel: die Anwendung startet gar nicht erst, wenn etwas fehlt oder
 * Unsinn ist. Lieber ein klarer Absturz beim Start als ein stiller Fehler
 * um drei Uhr morgens, weil DATABASE_URL leer war.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// import.meta.url ist der ESM-Ersatz für __dirname.
const hier = path.dirname(fileURLToPath(import.meta.url));

// Die .env liegt in der Wurzel des Repos, nicht in apps/api.
// Aus src/ (Entwicklung) wie aus dist/ (gebaut) sind das drei Ebenen hoch.
const envDatei = path.resolve(hier, "../../../.env");

try {
  // Node kann das seit v22 selbst, dafür braucht es kein dotenv mehr.
  process.loadEnvFile(envDatei);
} catch {
  // Keine .env vorhanden ist völlig in Ordnung: in Produktion kommen die
  // Werte aus der Umgebung des Containers, nicht aus einer Datei.
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  /**
   * Auf welcher Netzwerkschnittstelle gelauscht wird.
   *
   * Die Vorgabe ist 127.0.0.1, also NUR die eigene Maschine. Das ist
   * Absicht: vor der Anwendung steht immer etwas, das TLS macht (Caddy,
   * nginx, Tailscale). Lauschte sie auf allen Schnittstellen, wäre sie
   * im Firmennetz zusätzlich unter http://rechner:3000 erreichbar, an
   * diesem Schutz vorbei. Wer sich dort anmeldet, schickt sein Passwort
   * unverschlüsselt durchs Netz.
   *
   * Im Docker-Container muss dagegen 0.0.0.0 stehen: dort ist 127.0.0.1
   * das Innere des Containers, und die Portweiterleitung käme nie an.
   * Deshalb setzt docker-compose.prod.yml HOST ausdruecklich.
   *
   * Sichere Vorgabe, unsichere Einstellung nur dort, wo sie gebraucht
   * wird und begründet ist.
   */
  HOST: z.string().min(1).default("127.0.0.1"),

  // Das "error" greift auch, wenn die Variable komplett fehlt. Ohne das
  // käme an dieser Stelle Zods englische Standardmeldung durch.
  DATABASE_URL: z
    .string({ error: "DATABASE_URL fehlt. Vorlage steht in .env.example." })
    .min(1, "DATABASE_URL ist leer.")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "DATABASE_URL muss mit postgres:// oder postgresql:// beginnen.",
    }),

  SESSION_SECRET: z
    .string({ error: "SESSION_SECRET fehlt. Vorlage steht in .env.example." })
    .min(
      32,
      "SESSION_SECRET muss mindestens 32 Zeichen lang sein. Erzeugen mit: node -e \"console.log(crypto.randomBytes(32).toString('hex'))\"",
    ),

  WEB_ORIGIN: z.url().default("http://localhost:5173"),

  /**
   * Wie viele Zwischenstationen (nginx, Caddy, Load Balancer) vor der API
   * stehen. Ohne diesen Wert sieht Express als Absender-IP immer die des
   * Proxys, also bei ALLEN Benutzern dieselbe. Die Anmeldesperre würde
   * dann entweder alle gemeinsam aussperren oder gar nicht greifen.
   * 0 = kein Proxy davor (lokale Entwicklung).
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

const ergebnis = EnvSchema.safeParse(process.env);

if (!ergebnis.success) {
  console.error("\nKonfiguration ist unvollständig oder falsch:\n");
  for (const problem of ergebnis.error.issues) {
    console.error(`  ${problem.path.join(".")}: ${problem.message}`);
  }
  console.error("\nLege eine .env an (Vorlage: .env.example) und starte neu.\n");
  process.exit(1);
}

export const config = ergebnis.data;
export type Config = typeof config;

export const istProduktion = config.NODE_ENV === "production";
export const istTest = config.NODE_ENV === "test";
