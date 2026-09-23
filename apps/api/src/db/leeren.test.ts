/**
 * Prueft, dass --leeren beim Import ueberhaupt durchlaeuft.
 *
 * Warum es diesen Test gibt: Postgres verweigert ein truncate auf eine
 * Tabelle, auf die ein Fremdschluessel zeigt, und zwar unabhaengig davon,
 * ob in der verweisenden Tabelle Zeilen stehen. Wer also eine neue
 * Tabelle mit einem Verweis auf mitarbeiter oder objekte anlegt, macht
 * damit still das Import-Kommando kaputt.
 *
 * Genau das ist passiert: ferien_uebertrag kam spaeter dazu als das
 * Kommando, und --leeren brach danach mit "cannot truncate a table
 * referenced in a foreign key constraint" ab. Gemerkt hat das niemand,
 * weil das Kommando von Hand aufgerufen wird und selten.
 *
 * Der Test fuehrt die echte Anweisung aus und rollt sie zurueck. Kommt
 * eine neue verweisende Tabelle dazu, faellt er, und zwar mit genau der
 * Meldung, die Postgres auch im Ernstfall ausgeben wuerde.
 */
import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { datenbankSchliessen, db } from "./index.js";
import { ZU_LEEREN } from "./import.js";

afterAll(async () => {
  await datenbankSchliessen();
});

test("die truncate-Anweisung von --leeren laeuft durch", async () => {
  await expect(
    db.transaction(async (tx) => {
      await tx.execute(sql.raw(`truncate table ${ZU_LEEREN.join(", ")} restart identity`));
      // Immer zuruecknehmen: der Test soll pruefen, ob die Anweisung
      // zulaessig ist, nicht die Testdatenbank ausraeumen.
      throw new Error("absichtlicher Rollback");
    }),
  ).rejects.toThrow("absichtlicher Rollback");
});

test("Konten, Sitzungen und Protokoll bleiben stehen", () => {
  /*
   * Ein erneuter Import darf niemanden aussperren und keine Spuren
   * loeschen. Wer hier eine dieser Tabellen hinzufuegt, nimmt dem
   * Protokoll seinen Zweck.
   */
  for (const tabelle of ["benutzer", "sitzungen", "protokoll"]) {
    expect(ZU_LEEREN).not.toContain(tabelle);
  }
});

test("jede Tabelle mit Verweis auf mitarbeiter oder objekte steht in der Liste", async () => {
  // Der eigentliche Waechter: er findet eine neue verweisende Tabelle
  // auch dann, wenn sie noch leer ist und nichts kaputtmacht.
  const { rows } = (await db.execute(sql`
    select distinct c.conrelid::regclass::text as verweiser
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid::regclass::text in ('mitarbeiter', 'objekte', 'kalk_monat')
  `)) as unknown as { rows: { verweiser: string }[] };

  const fehlende = rows.map((r) => r.verweiser).filter((t) => !ZU_LEEREN.includes(t as never));

  expect(
    fehlende,
    `Diese Tabellen verweisen auf geleerte Tabellen und fehlen in ZU_LEEREN`,
  ).toEqual([]);
});
