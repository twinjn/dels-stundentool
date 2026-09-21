/**
 * Ein einziger Ort, an dem der Browser mit der API redet.
 *
 * Warum kein nacktes fetch() ueberall: fetch wirft bei einem 500er keinen
 * Fehler, es liefert einfach eine Antwort mit Status 500. Wer das vergisst,
 * arbeitet froehlich mit einer Fehlermeldung weiter, als waeren es Daten.
 * Dieser Wrapper macht daraus einen echten Fehler, den man fangen muss.
 */

export type Feldfehler = { feld: string; problem: string };

export class ApiFehler extends Error {
  readonly status: number;
  readonly code: string;
  readonly felder: Feldfehler[];

  constructor(status: number, code: string, nachricht: string, felder: Feldfehler[] = []) {
    super(nachricht);
    this.name = "ApiFehler";
    this.status = status;
    this.code = code;
    this.felder = felder;
  }

  /** Session abgelaufen oder gar nicht angemeldet. */
  get istNichtAngemeldet(): boolean {
    return this.status === 401;
  }
}

// Leer lassen heisst: gleiche Herkunft wie die Oberflaeche. Im Entwickeln
// leitet Vite das weiter, in Produktion liefert Express beides aus.
const BASIS = import.meta.env.VITE_API_URL ?? "";

async function anfrage<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
  let antwort: Response;

  try {
    antwort = await fetch(`${BASIS}/api${pfad}`, {
      ...optionen,
      // Sorgt dafuer, dass das Session-Cookie mitgeschickt wird.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...optionen.headers,
      },
    });
  } catch {
    // Kein Netz, Server aus, DNS kaputt. fetch wirft nur hier.
    throw new ApiFehler(0, "keine_verbindung", "Keine Verbindung zum Server.");
  }

  if (antwort.status === 204) {
    return undefined as T;
  }

  const inhaltstyp = antwort.headers.get("content-type") ?? "";
  const inhalt: unknown = inhaltstyp.includes("application/json")
    ? await antwort.json()
    : await antwort.text();

  if (!antwort.ok) {
    // 502, 503 und 504 heissen: zwischen Browser und API steht etwas, aber
    // die API selbst antwortet nicht. Beim Entwickeln ist das der
    // Vite-Proxy, spaeter waere es der Webserver vor der Anwendung.
    // Fuer den Benutzer ist die Zahl bedeutungslos, die Ursache nicht.
    if (antwort.status === 502 || antwort.status === 503 || antwort.status === 504) {
      throw new ApiFehler(
        antwort.status,
        "nicht_erreichbar",
        "Der Server ist gerade nicht erreichbar.",
      );
    }

    const d = (inhalt ?? {}) as { code?: string; nachricht?: string; felder?: Feldfehler[] };
    throw new ApiFehler(
      antwort.status,
      d.code ?? "fehler",
      d.nachricht ?? `Serverfehler (${antwort.status}).`,
      d.felder ?? [],
    );
  }

  return inhalt as T;
}

export const api = {
  get: <T>(pfad: string) => anfrage<T>(pfad),
  post: <T>(pfad: string, daten?: unknown) =>
    anfrage<T>(pfad, { method: "POST", body: JSON.stringify(daten ?? {}) }),
  patch: <T>(pfad: string, daten?: unknown) =>
    anfrage<T>(pfad, { method: "PATCH", body: JSON.stringify(daten ?? {}) }),
  delete: <T>(pfad: string) => anfrage<T>(pfad, { method: "DELETE" }),
};
