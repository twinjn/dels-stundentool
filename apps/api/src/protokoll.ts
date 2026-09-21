/**
 * Aenderungsprotokoll.
 *
 * Festgehalten wird, wer wann welchen Datensatz angelegt, geaendert oder
 * geloescht hat, mitsamt dem alten und dem neuen Wert. Bei Lohn- und
 * Personendaten ist das kein Luxus: es beantwortet die Frage "wer hat
 * diesen Betrag angefasst", bevor daraus ein Streit wird.
 *
 * ENTSCHEIDUNG: Wenn das Protokollieren scheitert, scheitert auch die
 * Aenderung. Das ist unbequem, aber die Alternative waere ein Protokoll
 * mit Luecken, und ein Protokoll mit Luecken ist schlimmer als keines:
 * man verlaesst sich darauf und merkt erst im Ernstfall, dass genau der
 * interessante Eintrag fehlt.
 */
import type { AngemeldeterBenutzer } from "./auth/sitzung.js";
import { db } from "./db/index.js";
import { protokoll } from "./db/schema.js";

export type Aktion = "anlegen" | "aendern" | "loeschen";

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
    // Zusaetzlich der Klartextname: der bleibt lesbar, auch wenn das
    // Konto spaeter verschwindet.
    benutzerName: angaben.benutzer?.name ?? null,
    aktion: angaben.aktion,
    tabelle: angaben.tabelle,
    datensatzId: angaben.datensatzId ?? null,
    vorher: angaben.vorher ?? null,
    nachher: angaben.nachher ?? null,
  });
}

/**
 * Liefert nur die Felder, die sich tatsaechlich geaendert haben.
 * Ohne das stuende bei jeder Aenderung der komplette Datensatz im
 * Protokoll, und man saehe vor lauter Zeilen nicht, was passiert ist.
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
