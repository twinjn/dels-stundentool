/**
 * Spielt die Objektstammdaten und den Kalkulationsmonat Februar 2026 ein.
 *
 *   npm run db:stammdaten            Trockenlauf, zeigt nur was passieren würde
 *   npm run db:stammdaten -- --schreiben
 *
 * WOZU: Der Excel-Import aus den Stundendateien legt Objekte nur mit
 * Nummer an, weil dort kein Name steht. In der Kalkulation heissen sie
 * dann "Objekt 10002" und niemand kann eine Zeile zuordnen. Die echten
 * Namen, Adressen und Abo-Beträge stammen aus Kalkulationstabelle_DELS.xlsx
 * und liegen als stammdaten2026.sql daneben.
 *
 * Alles läuft in EINER Transaktion. Entweder ist am Ende alles da oder
 * gar nichts, ein halb eingespielter Stammdatenstand wäre schlimmer als
 * keiner.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { datenbankSchliessen, db } from "./index.js";

const hier = path.dirname(fileURLToPath(import.meta.url));
const datei = path.join(hier, "stammdaten2026.sql");
const schreiben = process.argv.includes("--schreiben");

type Zaehlung = { platzhalter: number; ohneAbo: number; monate: number; objektzeilen: number };

async function zaehle(): Promise<Zaehlung> {
  const eine = async (frage: ReturnType<typeof sql>): Promise<number> => {
    const { rows } = (await db.execute(frage)) as unknown as { rows: { n: string }[] };
    return Number(rows[0]?.n ?? 0);
  };
  return {
    // Ein Objekt, das noch "Objekt 10002" heisst, hat keinen echten Namen.
    platzhalter: await eine(
      sql`select count(*)::text as n from objekte where name = 'Objekt ' || objekt_nr`,
    ),
    ohneAbo: await eine(
      sql`select count(*)::text as n from objekte where abo_betrag is null or abo_betrag = 0`,
    ),
    monate: await eine(sql`select count(*)::text as n from kalk_monat`),
    objektzeilen: await eine(sql`select count(*)::text as n from kalk_objekt_monat`),
  };
}

function zeile(titel: string, vorher: number, nachher: number): string {
  const pfeil = vorher === nachher ? "  (unveraendert)" : `  ->  ${nachher}`;
  return `  ${titel.padEnd(34)} ${String(vorher).padStart(4)}${pfeil}`;
}

const anweisungen = fs.readFileSync(datei, "utf8");

try {
  const vorher = await zaehle();

  console.log("\nVorher:");
  console.log(`  Objekte ohne echten Namen          ${String(vorher.platzhalter).padStart(4)}`);
  console.log(`  Objekte ohne Abo-Betrag            ${String(vorher.ohneAbo).padStart(4)}`);
  console.log(`  Kalkulationsmonate                 ${String(vorher.monate).padStart(4)}`);

  if (!schreiben) {
    console.log(
      "\nTROCKENLAUF. Es wurde nichts geschrieben." +
        "\nWenn das oben passt, nochmal mit --schreiben aufrufen.\n",
    );
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(anweisungen));
  });

  const nachher = await zaehle();

  console.log("\nNachher:");
  console.log(zeile("Objekte ohne echten Namen", vorher.platzhalter, nachher.platzhalter));
  console.log(zeile("Objekte ohne Abo-Betrag", vorher.ohneAbo, nachher.ohneAbo));
  console.log(zeile("Kalkulationsmonate", vorher.monate, nachher.monate));
  console.log(zeile("Objektzeilen in Monaten", vorher.objektzeilen, nachher.objektzeilen));

  if (nachher.platzhalter > 0) {
    console.log(
      `\n${nachher.platzhalter} Objekt(e) heissen weiterhin "Objekt <Nummer>".` +
        "\nFuer die steht in der Kalkulationstabelle kein Name. Die musst du" +
        "\nunter Objekte von Hand benennen.\n",
    );
  } else {
    console.log("\nFertig.\n");
  }
} catch (fehler) {
  console.error("\nFehlgeschlagen, es wurde nichts geschrieben:\n", fehler);
  process.exitCode = 1;
} finally {
  await datenbankSchliessen();
}
