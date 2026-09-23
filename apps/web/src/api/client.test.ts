/**
 * Tests des API-Klienten.
 *
 * Diese Datei ist die Stelle im Frontend, an der sich ein Fehler am
 * weitesten ausbreitet: jede Seite ruft sie auf. Geht hier die
 * Fehlerbehandlung schief, sieht der Benutzer überall dieselbe falsche
 * oder gar keine Meldung.
 *
 * Der häufigste Denkfehler mit fetch steckt gleich im ersten Test:
 * fetch wirft bei einem 500er NICHT. Es liefert einfach eine Antwort
 * mit Status 500 zurueck. Wer das vergisst, arbeitet fröhlich mit
 * einer Fehlermeldung weiter, als wären es Daten.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiFehler, api } from "./client.js";

/** Baut eine Antwort, wie fetch sie liefern wuerde. */
function antwort(status: number, koerper: unknown, typ = "application/json"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name === "content-type" ? typ : null) },
    json: () => Promise.resolve(koerper),
    text: () => Promise.resolve(String(koerper)),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("Erfolgsfall", () => {
  test("gibt den Körper zurück", async () => {
    vi.mocked(fetch).mockResolvedValue(antwort(200, { name: "Anna" }));
    await expect(api.get("/mitarbeiter")).resolves.toEqual({ name: "Anna" });
  });

  test("schickt das Sitzungscookie mit", async () => {
    /*
     * Ohne credentials: "include" schickt der Browser bei einer Anfrage
     * an einen anderen Ursprung kein Cookie mit. Die Anwendung wäre
     * dann bei jedem Aufruf abgemeldet, und zwar nur in Produktion,
     * wo API und Oberfläche unter verschiedenen Adressen liegen
     * können. Der Fehler, den niemand beim Entwickeln sieht.
     */
    vi.mocked(fetch).mockResolvedValue(antwort(200, {}));
    await api.get("/auth/ich");

    const [, optionen] = vi.mocked(fetch).mock.calls[0]!;
    expect(optionen?.credentials).toBe("include");
  });

  test("gibt bei 204 nichts zurück, ohne den Körper zu lesen", async () => {
    // 204 heisst "erledigt, kein Inhalt". Ein .json() darauf würde
    // werfen, weil nichts da ist.
    const leer = antwort(204, null);
    vi.mocked(fetch).mockResolvedValue(leer);
    await expect(api.delete("/mitarbeiter/x")).resolves.toBeUndefined();
  });
});

describe("Fehlerbehandlung", () => {
  test("macht aus einem 500er einen echten Fehler", async () => {
    vi.mocked(fetch).mockResolvedValue(
      antwort(500, { code: "serverfehler", nachricht: "Unerwarteter Fehler." }),
    );

    await expect(api.get("/stunden")).rejects.toBeInstanceOf(ApiFehler);
    await expect(api.get("/stunden")).rejects.toMatchObject({
      status: 500,
      code: "serverfehler",
      message: "Unerwarteter Fehler.",
    });
  });

  test("reicht die Feldfehler weiter", async () => {
    // Ohne die kann ein Formular nur "Eingabe ist ungültig" sagen und
    // nicht, welches Feld klemmt.
    vi.mocked(fetch).mockResolvedValue(
      antwort(400, {
        code: "ungueltig",
        nachricht: "Eingabe ist ungültig.",
        felder: [{ feld: "email", problem: "Das sieht nicht nach einer E-Mail aus." }],
      }),
    );

    await expect(api.post("/mitarbeiter", {})).rejects.toMatchObject({
      felder: [{ feld: "email", problem: "Das sieht nicht nach einer E-Mail aus." }],
    });
  });

  test("erkennt fehlende Anmeldung an der 401", async () => {
    vi.mocked(fetch).mockResolvedValue(
      antwort(401, { code: "nicht_angemeldet", nachricht: "Nicht angemeldet." }),
    );

    try {
      await api.get("/dashboard");
      expect.unreachable("hätte werfen muessen");
    } catch (e) {
      expect((e as ApiFehler).istNichtAngemeldet).toBe(true);
    }
  });

  test("übersetzt 502, 503 und 504 in eine verständliche Meldung", async () => {
    /*
     * Diese drei kommen nicht von der Anwendung, sondern von dem, was
     * davorsteht: beim Entwickeln der Vite-Proxy, später der
     * Webserver. Der Körper ist dann HTML oder leer, und ohne diese
     * Sonderbehandlung stünde beim Benutzer "Serverfehler (502)".
     */
    for (const status of [502, 503, 504]) {
      vi.mocked(fetch).mockResolvedValue(antwort(status, "<html>Bad Gateway</html>", "text/html"));
      await expect(api.get("/dashboard")).rejects.toMatchObject({
        code: "nicht_erreichbar",
        message: "Der Server ist gerade nicht erreichbar.",
      });
    }
  });

  test("fängt ein geworfenes fetch ab", async () => {
    // Kein Netz, Server aus, DNS kaputt: nur in diesem Fall wirft fetch
    // von sich aus. Ohne das Abfangen bekäme der Benutzer einen rohen
    // TypeError zu sehen.
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(api.get("/dashboard")).rejects.toMatchObject({
      status: 0,
      code: "keine_verbindung",
      message: "Keine Verbindung zum Server.",
    });
  });

  test("kommt mit einer Fehlerantwort ohne Körper zurecht", async () => {
    // Manche Zwischenstationen antworten mit einem nackten Status. Die
    // Anwendung darf daran nicht auseinanderfallen.
    vi.mocked(fetch).mockResolvedValue(antwort(418, null));
    await expect(api.get("/dashboard")).rejects.toMatchObject({
      code: "fehler",
      message: "Serverfehler (418).",
    });
  });
});
