/**
 * Ein einziger Ort, an dem der Browser mit der API redet.
 *
 * Warum kein nacktes fetch() überall: fetch wirft bei einem 500er keinen
 * Fehler, es liefert einfach eine Antwort mit Status 500. Wer das vergisst,
 * arbeitet fröhlich mit einer Fehlermeldung weiter, als wären es Daten.
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
      // Sorgt dafür, dass das Session-Cookie mitgeschickt wird.
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
    // Vite-Proxy, später wäre es der Webserver vor der Anwendung.
    // Für den Benutzer ist die Zahl bedeutungslos, die Ursache nicht.
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

/**
 * Eine Datei herunterladen.
 *
 * Warum nicht einfach ein <a href="/api/export/...">? Weil ein Link bei
 * einem Fehler die rohe JSON-Antwort des Servers im Browserfenster
 * anzeigt ("keinZugriff: Für kalkulation:lesen fehlt..."). So bekommt
 * der Benutzer dieselbe Fehlermeldung wie überall sonst.
 *
 * Der Dateiname kommt aus dem Content-Disposition-Kopf, damit ihn der
 * Server bestimmt und nicht zwei Stellen ihn getrennt zusammenbauen.
 */
async function datei(pfad: string): Promise<void> {
  let antwort: Response;

  try {
    antwort = await fetch(`${BASIS}/api${pfad}`, { credentials: "include" });
  } catch {
    throw new ApiFehler(0, "keine_verbindung", "Keine Verbindung zum Server.");
  }

  if (!antwort.ok) {
    const inhalt: unknown = (antwort.headers.get("content-type") ?? "").includes("application/json")
      ? await antwort.json()
      : {};
    const d = (inhalt ?? {}) as { code?: string; nachricht?: string };
    throw new ApiFehler(
      antwort.status,
      d.code ?? "fehler",
      d.nachricht ?? `Der Export ist fehlgeschlagen (${antwort.status}).`,
    );
  }

  const kopf = antwort.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(kopf)?.[1] ?? "export.xlsx";

  const blob = await antwort.blob();
  const adresse = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = adresse;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Ohne das hält der Browser den Speicher für die Datei bis zum
  // Neuladen der Seite fest. Bei einem 5-MB-Export pro Monat fällt das
  // nicht auf, bei zwanzig Klicks schon.
  URL.revokeObjectURL(adresse);
}

export const api = {
  get: <T>(pfad: string) => anfrage<T>(pfad),
  datei,
  post: <T>(pfad: string, daten?: unknown) =>
    anfrage<T>(pfad, { method: "POST", body: JSON.stringify(daten ?? {}) }),
  put: <T>(pfad: string, daten?: unknown) =>
    anfrage<T>(pfad, { method: "PUT", body: JSON.stringify(daten ?? {}) }),
  patch: <T>(pfad: string, daten?: unknown) =>
    anfrage<T>(pfad, { method: "PATCH", body: JSON.stringify(daten ?? {}) }),
  /**
   * DELETE, bei Bedarf mit Rumpf.
   *
   * Ein Rumpf bei DELETE ist unüblich, aber erlaubt, und hier
   * sinnvoll: das Wiederöffnen eines Monats verlangt eine Begründung,
   * und die gehört zur Anfrage, nicht in die Adresszeile, wo sie in
   * jedem Serverprotokoll landen würde.
   */
  delete: <T>(pfad: string, daten?: unknown) =>
    anfrage<T>(pfad, {
      method: "DELETE",
      ...(daten === undefined ? {} : { body: JSON.stringify(daten) }),
    }),
};
