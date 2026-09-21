/**
 * Bremse gegen das Durchprobieren von Passwoertern.
 *
 * Ohne so etwas kann jemand in einer Nacht Millionen Passwoerter testen.
 * Mit dieser Bremse sind es fuenf pro Viertelstunde.
 *
 * Bewusst selbst geschrieben und bewusst einfach: das ist ein Zaehler,
 * keine Kryptographie. Der Zustand liegt im Arbeitsspeicher, nach einem
 * Neustart ist er weg. Fuer eine Anwendung mit einer Handvoll Benutzern
 * auf einem Server ist das ausreichend. Sobald mehrere Server parallel
 * laufen, gehoert der Zaehler in die Datenbank oder nach Redis.
 *
 * Gezaehlt wird pro Kombination aus IP und E-Mail. Nur nach IP zu zaehlen
 * wuerde ein ganzes Buero aussperren, sobald einer sich vertippt. Nur nach
 * E-Mail zu zaehlen erlaubt es, von vielen Adressen aus dasselbe Konto
 * anzugreifen.
 */

type Eintrag = {
  versuche: number;
  ersterVersuch: number;
  gesperrtBis: number;
};

const FENSTER_MS = 15 * 60 * 1000;
const MAX_VERSUCHE = 5;
const SPERRE_MS = 15 * 60 * 1000;
const AUFRAEUMEN_AB = 10_000;

const speicher = new Map<string, Eintrag>();

export function schluesselFuer(ip: string, email: string): string {
  return `${ip}|${email.toLowerCase()}`;
}

/** Verhindert, dass die Map unbegrenzt waechst. */
function aufraeumen(jetzt: number): void {
  if (speicher.size < AUFRAEUMEN_AB) return;
  for (const [schluessel, eintrag] of speicher) {
    if (eintrag.gesperrtBis < jetzt && jetzt - eintrag.ersterVersuch > FENSTER_MS) {
      speicher.delete(schluessel);
    }
  }
}

export type Pruefung = { erlaubt: true } | { erlaubt: false; sekunden: number };

export function darfVersuchen(schluessel: string): Pruefung {
  const jetzt = Date.now();
  const eintrag = speicher.get(schluessel);

  if (!eintrag) return { erlaubt: true };

  if (eintrag.gesperrtBis > jetzt) {
    return { erlaubt: false, sekunden: Math.ceil((eintrag.gesperrtBis - jetzt) / 1000) };
  }

  // Das Zeitfenster ist vorbei, wir fangen fuer diesen Schluessel neu an.
  if (jetzt - eintrag.ersterVersuch > FENSTER_MS) {
    speicher.delete(schluessel);
  }

  return { erlaubt: true };
}

export function versuchGescheitert(schluessel: string): void {
  const jetzt = Date.now();
  aufraeumen(jetzt);

  const eintrag = speicher.get(schluessel) ?? {
    versuche: 0,
    ersterVersuch: jetzt,
    gesperrtBis: 0,
  };

  eintrag.versuche += 1;

  if (eintrag.versuche >= MAX_VERSUCHE) {
    eintrag.gesperrtBis = jetzt + SPERRE_MS;
    eintrag.versuche = 0;
    eintrag.ersterVersuch = jetzt;
  }

  speicher.set(schluessel, eintrag);
}

export function versuchGelungen(schluessel: string): void {
  speicher.delete(schluessel);
}

/** Nur fuer Tests: setzt alle Zaehler zurueck. */
export function schutzZuruecksetzen(): void {
  speicher.clear();
}
