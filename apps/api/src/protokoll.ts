/**
 * Aenderungsprotokoll.
 *
 * Festgehalten wird, wer wann welchen Datensatz angelegt, geändert oder
 * gelöscht hat, mitsamt dem alten und dem neuen Wert. Bei Lohn- und
 * Personendaten ist das kein Luxus: es beantwortet die Frage "wer hat
 * diesen Betrag angefasst", bevor daraus ein Streit wird.
 *
 * ENTSCHEIDUNG: Wenn das Protokollieren scheitert, scheitert auch die
 * Aenderung. Das ist unbequem, aber die Alternative wäre ein Protokoll
 * mit Lücken, und ein Protokoll mit Lücken ist schlimmer als keines:
 * man verlässt sich darauf und merkt erst im Ernstfall, dass genau der
 * interessante Eintrag fehlt.
 */
import type { AngemeldeterBenutzer } from "./auth/sitzung.js";
import { db } from "./db/index.js";
import { protokoll } from "./db/schema.js";

export type Aktion = "anlegen" | "aendern" | "loeschen" | "exportieren";

export async function protokolliere(angaben: {
  benutzer: AngemeldeterBenutzer | undefined;
  aktion: Aktion;
  tabelle: string;
  datensatzId?: string | undefined;
  vorher?: unknown;
  nachher?: unknown;
}): Promise<void> {
  await db.insert(protokoll).values({
    benutzerId: angaben.benutzer?.id ?? null,
    // Zusätzlich der Klartextname: der bleibt lesbar, auch wenn das
    // Konto später verschwindet.
    benutzerName: angaben.benutzer?.name ?? null,
    aktion: angaben.aktion,
    tabelle: angaben.tabelle,
    datensatzId: angaben.datensatzId ?? null,
    vorher: angaben.vorher ?? null,
    nachher: angaben.nachher ?? null,
  });
}

/**
 * Liefert nur die Felder, die sich tatsächlich geändert haben.
 * Ohne das stünde bei jeder Änderung der komplette Datensatz im
 * Protokoll, und man sähe vor lauter Zeilen nicht, was passiert ist.
 */
export function unterschiede<T extends Record<string, unknown>>(
  vorher: T,
  nachher: Partial<T>,
): { vorher: Partial<T>; nachher: Partial<T> } {
  const alt: Partial<T> = {};
  const neu: Partial<T> = {};

  for (const feld of Object.keys(nachher) as (keyof T)[]) {
    if (vorher[feld] !== nachher[feld]) {
      alt[feld] = vorher[feld];
      neu[feld] = nachher[feld];
    }
  }

  return { vorher: alt, nachher: neu };
}
