/**
 * Test fuer das Anlegen des ersten Admins.
 *
 * WARUM ES DIESEN TEST GIBT: die Eingabe dieses Skripts ist jetzt zweimal
 * kaputtgegangen, beide Male auf dieselbe Weise und beide Male nur dann,
 * wenn die Antworten NICHT von einer Tastatur kamen. Genau so ruft es
 * aber ein Einrichtungsskript auf. Gemerkt hat es niemand, weil von Hand
 * am Terminal immer alles lief.
 *
 * Deshalb wird hier das echte Skript als eigener Prozess gestartet und
 * mit umgeleiteter Eingabe gefuettert. Eine nachgebaute Leseschleife
 * wuerde genau den Fehler nicht zeigen, um den es geht.
 */
import { spawn } from "node:child_process";
import { eq, like } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { datenbankSchliessen, db } from "./index.js";
import { benutzer } from "./schema.js";
import { markeErzeugen } from "../test/hilfen.js";

const marke = markeErzeugen("adm");
const PASSWORT = "ein-ausreichend-langes-passwort";

afterAll(async () => {
  await db.delete(benutzer).where(like(benutzer.email, `%${marke}%`));
  await datenbankSchliessen();
});

/**
 * Startet das Skript als eigenen Prozess.
 * `eingabe` wird auf die Standardeingabe geschrieben, so wie es eine
 * Weiterleitung in der Kommandozeile tut.
 */
function starte(
  argumente: string[],
  eingabe: string,
  umgebung: Record<string, string> = {},
): Promise<{ code: number | null; ausgabe: string }> {
  return new Promise((aufloesen, ablehnen) => {
    const prozess = spawn("npx", ["tsx", "src/db/adminAnlegen.ts", ...argumente], {
      cwd: new URL("../..", import.meta.url).pathname,
      env: { ...process.env, ...umgebung },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let ausgabe = "";
    prozess.stdout.on("data", (d: Buffer) => (ausgabe += d.toString()));
    prozess.stderr.on("data", (d: Buffer) => (ausgabe += d.toString()));

    // Wenn das Skript haengt, soll der Test das melden und nicht
    // wortlos in den Zeitablauf von Vitest laufen.
    const wecker = setTimeout(() => {
      prozess.kill("SIGKILL");
      ablehnen(new Error(`Das Skript haengt. Bisherige Ausgabe:\n${ausgabe}`));
    }, 25_000);

    prozess.on("error", ablehnen);
    prozess.on("close", (code) => {
      clearTimeout(wecker);
      aufloesen({ code, ausgabe });
    });

    prozess.stdin.write(eingabe);
    prozess.stdin.end();
  });
}

describe("adminAnlegen mit umgeleiteter Eingabe", () => {
  test("alle vier Antworten auf einmal", async () => {
    const email = `${marke}-eins@dels.ch`;
    const { code, ausgabe } = await starte(
      ["--noch-einen"],
      `${marke} Eins\n${email}\n${PASSWORT}\n${PASSWORT}\n`,
    );

    expect(ausgabe).toContain("Angelegt");
    expect(code).toBe(0);

    const [gefunden] = await db.select().from(benutzer).where(eq(benutzer.email, email));
    expect(gefunden?.rolle).toBe("admin");
  }, 40_000);

  test("Name und E-Mail als Argumente, Passwort umgeleitet", async () => {
    const email = `${marke}-zwei@dels.ch`;
    const { code } = await starte(
      ["--noch-einen", "--name", `${marke} Zwei`, "--email", email],
      `${PASSWORT}\n${PASSWORT}\n`,
    );

    expect(code).toBe(0);
    const [gefunden] = await db.select().from(benutzer).where(eq(benutzer.email, email));
    expect(gefunden).toBeDefined();
  }, 40_000);

  test("Passwort aus der Umgebung, gar keine Eingabe", async () => {
    const email = `${marke}-drei@dels.ch`;
    const { code } = await starte(
      ["--noch-einen", "--name", `${marke} Drei`, "--email", email],
      "",
      { ADMIN_PASSWORT: PASSWORT },
    );

    expect(code).toBe(0);
    const [gefunden] = await db.select().from(benutzer).where(eq(benutzer.email, email));
    expect(gefunden).toBeDefined();
  }, 40_000);

  test("zwei verschiedene Passwoerter werden abgelehnt", async () => {
    const email = `${marke}-vier@dels.ch`;
    const { code, ausgabe } = await starte(
      ["--noch-einen", "--name", `${marke} Vier`, "--email", email],
      `${PASSWORT}\nein-ganz-anderes-passwort\n`,
    );

    expect(code).toBe(1);
    expect(ausgabe).toContain("stimmen nicht ueberein");

    const [gefunden] = await db.select().from(benutzer).where(eq(benutzer.email, email));
    expect(gefunden).toBeUndefined();
  }, 40_000);

  test("abgebrochene Eingabe haengt nicht, sondern meldet einen Fehler", async () => {
    const email = `${marke}-fuenf@dels.ch`;
    // Nur eine von zwei Passwortzeilen, dann Ende der Eingabe.
    const { code } = await starte(
      ["--noch-einen", "--name", `${marke} Fuenf`, "--email", email],
      `${PASSWORT}\n`,
    );

    expect(code).toBe(1);
    const [gefunden] = await db.select().from(benutzer).where(eq(benutzer.email, email));
    expect(gefunden).toBeUndefined();
  }, 40_000);
});
