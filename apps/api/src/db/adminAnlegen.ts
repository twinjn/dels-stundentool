/**
 * Legt den ersten Admin an.
 *
 * Henne-Ei-Problem: Benutzer anlegen darf nur ein Admin, aber am Anfang
 * gibt es keinen. Deshalb dieses Werkzeug, das direkt an der Datenbank
 * arbeitet und nicht über die API geht.
 *
 *   npm run db:admin -w @dels/api
 *
 * Das Passwort wird abgefragt und dabei nicht angezeigt. Es steht damit
 * auch nicht in der Verlaufsliste deiner Kommandozeile. In einem Skript
 * geht alternativ ADMIN_PASSWORT als Umgebungsvariable.
 */
import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { BenutzerAnlegenSchema } from "@dels/shared";
import { eq, sql } from "drizzle-orm";
import { hashePasswort } from "../auth/passwort.js";
import { db } from "./index.js";
import { benutzer } from "./schema.js";
import { datenbankSchliessen } from "./index.js";

/**
 * Liest ein benanntes Argument: --name "Anna Muster"
 * Damit lässt sich das Skript auch automatisiert aufrufen, etwa beim
 * Einrichten eines neuen Servers.
 */
function argument(name: string): string | undefined {
  const stelle = process.argv.indexOf(`--${name}`);
  if (stelle < 0) return undefined;
  const wert = process.argv[stelle + 1];
  return wert && !wert.startsWith("--") ? wert : undefined;
}

/**
 * EINE Leseschleife für das ganze Skript.
 *
 * Wichtig: pro Frage eine neue anzulegen funktioniert nur am Terminal.
 * Sobald die Eingabe aus einer Datei oder einer Weiterleitung kommt,
 * schluckt die erste Leseschleife den gesamten gepufferten Text, und die
 * zweite Frage wartet ewig auf etwas, das nie kommt.
 */
let leser: readline.Interface | undefined;
let stumm = false;

/**
 * Zeilen, die schon angekommen sind, aber noch niemand abgeholt hat.
 *
 * DAS IST DER KERN DES PROBLEMS, das hier zweimal zugeschlagen hat:
 * readline meldet jede fertige Zeile sofort, egal ob gerade jemand auf
 * eine Antwort wartet. Kommt die Eingabe aus einer Weiterleitung, sind
 * alle Zeilen auf einen Schlag da. Die erste Frage bekommt ihre Zeile,
 * und während ihre Zusage noch aufgelöst wird, meldet readline schon
 * die zweite Zeile, auf die in diesem Moment niemand hört. Sie ist
 * damit weg. Die zweite Frage wartet dann ewig auf etwas, das bereits
 * durchgelaufen ist.
 *
 * Mit rl.question() lässt sich das nicht beheben, weil die Lücke
 * zwischen zwei question()-Aufrufen genau dort liegt. Deshalb hört hier
 * dauerhaft ein Zuhörer mit und legt ab, was niemand abholt.
 */
const puffer: string[] = [];
let wartet: ((zeile: string) => void) | undefined;

function leserHolen(): readline.Interface {
  if (leser) return leser;

  const ausgabe = new Writable({
    write(stueck, _kodierung, fertig) {
      if (!stumm) process.stdout.write(stueck);
      fertig();
    },
  });

  leser = readline.createInterface({
    input: process.stdin,
    output: ausgabe,
    // Nur mit einer echten Tastatur. "terminal: true" schaltet die
    // Zeilenbearbeitung ein, die auf einer Weiterleitung Steuerzeichen
    // in die Ausgabe schreibt. Ohne Tastatur gibt es ausserdem kein Echo,
    // also nichts zu unterdrücken.
    terminal: process.stdin.isTTY === true,
  });

  leser.on("line", (zeile) => {
    if (wartet) {
      const jetzt = wartet;
      wartet = undefined;
      jetzt(zeile);
    } else {
      puffer.push(zeile);
    }
  });

  // Eingabe zu Ende, aber es fragt noch jemand. Lieber eine leere
  // Antwort und eine klare Fehlermeldung als ein Skript, das haengt.
  leser.on("close", () => {
    if (wartet) {
      const jetzt = wartet;
      wartet = undefined;
      jetzt("");
    }
  });

  return leser;
}

/** Fragt etwas ab. Bei "geheim" wird die Eingabe nicht dargestellt. */
async function frage(text: string, geheim = false): Promise<string> {
  leserHolen();
  process.stdout.write(text);

  stumm = geheim;
  const zeile =
    puffer.length > 0
      ? puffer.shift()!
      : await new Promise<string>((aufloesen) => {
          wartet = aufloesen;
        });
  stumm = false;

  if (geheim) process.stdout.write("\n");
  return zeile.trim();
}

try {
  const [vorhanden] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(benutzer)
    .where(eq(benutzer.rolle, "admin"));

  const anzahlAdmins = vorhanden?.anzahl ?? 0;

  if (anzahlAdmins > 0 && !process.argv.includes("--noch-einen")) {
    console.error(
      `\nEs gibt bereits ${anzahlAdmins} Admin-Konto(n).` +
        "\nWeitere Benutzer legst du in der Anwendung an." +
        "\nWenn du hier trotzdem eins erzeugen willst: -- --noch-einen\n",
    );
    process.exit(1);
  }

  console.log("\nErsten Admin anlegen");
  console.log('Automatisiert geht auch: -- --name "Anna Muster" --email anna@firma.ch\n');

  const name = argument("name") ?? (await frage("Name: "));
  const email = argument("email") ?? (await frage("E-Mail: "));

  // Das Passwort kann aus der Umgebung kommen, damit es beim Einrichten
  // per Skript nicht in der Verlaufsliste der Kommandozeile landet.
  const ausUmgebung = process.env.ADMIN_PASSWORT;
  const passwort = ausUmgebung ?? (await frage("Passwort (wird nicht angezeigt): ", true));
  const wiederholung = ausUmgebung ?? (await frage("Passwort wiederholen: ", true));

  if (passwort !== wiederholung) {
    console.error("\nDie beiden Passwörter stimmen nicht überein.\n");
    process.exit(1);
  }

  // Dieselbe Prüfung wie in der API. Keine zweite Regel, die abweichen kann.
  const geprueft = BenutzerAnlegenSchema.parse({ name, email, passwort, rolle: "admin" });

  const [angelegt] = await db
    .insert(benutzer)
    .values({
      name: geprueft.name,
      email: geprueft.email,
      rolle: "admin",
      passwortHash: await hashePasswort(geprueft.passwort),
    })
    .returning({ id: benutzer.id, email: benutzer.email });

  console.log(`\nAngelegt: ${angelegt?.email}\nDu kannst dich jetzt anmelden.\n`);
} catch (fehler) {
  if (fehler && typeof fehler === "object" && "issues" in fehler) {
    console.error("\nEingabe ist ungültig:");
    for (const problem of (fehler as { issues: { path: unknown[]; message: string }[] }).issues) {
      console.error(`  ${problem.path.join(".")}: ${problem.message}`);
    }
    console.error();
  } else {
    console.error("\nFehlgeschlagen:", fehler);
  }
  process.exitCode = 1;
} finally {
  leser?.close();
  await datenbankSchliessen();
}
