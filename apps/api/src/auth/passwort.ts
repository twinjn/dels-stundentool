/**
 * Passwoerter.
 *
 * Das ist die eine Stelle im Projekt, an der wir bewusst NICHTS selbst
 * erfinden. Passwort-Hashing ist Kryptographie, und selbstgebaute
 * Kryptographie ist der kuerzeste Weg zu einem Datenleck.
 *
 * Wir benutzen argon2id. Warum ausgerechnet das:
 *  - Es ist absichtlich langsam und speicherhungrig. Wer eine gestohlene
 *    Datenbank durchprobieren will, braucht pro Versuch 64 MB Speicher.
 *    Damit lohnen sich Grafikkarten-Farmen deutlich weniger.
 *  - Es salzt automatisch. Zwei gleiche Passwoerter ergeben verschiedene
 *    Hashes, Regenbogentabellen sind damit nutzlos.
 *  - "id" ist die Mischvariante, die gegen Seitenkanal- UND gegen
 *    Speicher-Angriffe schuetzt.
 *
 * Niemals SHA-256 oder MD5 fuer Passwoerter. Die sind auf Geschwindigkeit
 * gebaut, und Geschwindigkeit ist hier genau das Falsche.
 */
import argon2 from "argon2";
export { MINDESTLAENGE_PASSWORT } from "@dels/shared";

/**
 * Die Einstellungen stehen ausdruecklich hier, obwohl es zufaellig die
 * aktuellen Standardwerte der Bibliothek sind. Bei Sicherheitsparametern
 * verlaesst man sich nicht auf Standardwerte, die sich mit dem naechsten
 * Update aendern koennen.
 */
const EINSTELLUNGEN = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
} as const;

export function hashePasswort(klartext: string): Promise<string> {
  return argon2.hash(klartext, EINSTELLUNGEN);
}

export async function passwortStimmt(hash: string, klartext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, klartext);
  } catch {
    // Ein kaputter oder fremdformatiger Hash ist kein Grund abzustuerzen,
    // sondern schlicht ein gescheiterter Anmeldeversuch.
    return false;
  }
}

/**
 * Ein Hash, zu dem kein Mensch das Passwort kennt.
 *
 * Wozu: wenn jemand eine E-Mail eingibt, die es nicht gibt, wuerden wir
 * ohne diesen Hash sofort antworten. Bei einer existierenden E-Mail
 * dagegen erst nach rund 50 Millisekunden, weil argon2 erst rechnen muss.
 * Dieser Unterschied ist messbar, und damit kann ein Angreifer herausfinden,
 * WELCHE E-Mail-Adressen bei euch Konten haben. Das nennt sich
 * Benutzeraufzaehlung.
 *
 * Deshalb pruefen wir bei unbekannter E-Mail gegen diesen Hash. Das
 * Ergebnis ist immer falsch, aber es dauert genauso lange.
 */
const HASH_INS_LEERE =
  "$argon2id$v=19$m=65536,p=4,t=3$4ZSIkurdphjfde/9JnU8qg$50XrSDduvwwLX3sf67vb6PDX6G+EggZx31h8oJKY8vs";

export async function verbrauchePruefzeit(klartext: string): Promise<void> {
  await passwortStimmt(HASH_INS_LEERE, klartext);
}
