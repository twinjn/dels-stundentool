/**
 * Tests für das Passwortaendern.
 *
 * Diese Datei existiert wegen eines konkreten Fehlers. Die Seite rief
 * nach dem erfolgreichen Ändern abgemeldet() auf. Der Server hatte die
 * Sitzung ohnehin schon beendet, also schien das folgerichtig. Sobald
 * der Browserzustand aber auf "nicht angemeldet" sprang, tauschte die
 * Anwendung die ganze Oberfläche gegen die Anmeldemaske: die
 * Erfolgsmeldung war nie zu sehen, und der Benutzer stand ohne
 * Erklärung wieder vor dem Anmeldebildschirm.
 *
 * API-Tests waren grün, Typecheck war grün, die Funktion war kaputt.
 * Aufgefallen ist es erst beim Durchklicken. Der erste Test hier hält
 * genau das fest.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ApiFehler, api } from "../../api/client.js";
import { AuthKontext } from "../../app/AuthKontext.js";
import { benutzer } from "../../test/hilfen.js";
import { PasswortSeite } from "./PasswortSeite.js";
import { render } from "@testing-library/react";

const ALT = "altes-passwort-lang";
const NEU = "neues-passwort-lang";

/**
 * Rendert die Seite und gibt die nachgebaute abgemeldet()-Funktion
 * zurueck. Auf die kommt es an: WANN sie gerufen wird, entscheidet, ob
 * der Benutzer die Erfolgsmeldung jemals sieht.
 */
function rendere() {
  const abgemeldet = vi.fn();
  render(
    <AuthKontext.Provider
      value={{
        benutzer: benutzer("buero"),
        laedt: false,
        serverfehler: null,
        anmelden: vi.fn(),
        abmelden: vi.fn(),
        abgemeldet,
      }}
    >
      <PasswortSeite />
    </AuthKontext.Provider>,
  );
  return { abgemeldet };
}

async function ausfuellen(alt = ALT, neu = NEU, wiederholung = NEU) {
  const benutzerIn = userEvent.setup();
  await benutzerIn.type(screen.getByLabelText("Aktuelles Passwort"), alt);
  await benutzerIn.type(screen.getByLabelText("Neues Passwort"), neu);
  await benutzerIn.type(screen.getByLabelText(/Neues Passwort wiederholen/i), wiederholung);
  await benutzerIn.click(screen.getByRole("button", { name: /Passwort ändern/i }));
  return benutzerIn;
}

describe("Erfolgsfall", () => {
  test("zeigt die Erfolgsmeldung und meldet NICHT von selbst ab", async () => {
    vi.spyOn(api, "post").mockResolvedValue({});
    const { abgemeldet } = rendere();

    await ausfuellen();

    expect(await screen.findByText(/Das Passwort ist gesetzt/i)).toBeInTheDocument();

    /*
     * Der Kern des Ganzen. Würde hier abgemeldet() laufen, verschwände
     * die Meldung im selben Augenblick, in dem sie erscheint.
     */
    expect(abgemeldet).not.toHaveBeenCalled();
  });

  test("meldet erst ab, wenn der Benutzer den Knopf drückt", async () => {
    vi.spyOn(api, "post").mockResolvedValue({});
    const { abgemeldet } = rendere();

    const benutzerIn = await ausfuellen();
    await screen.findByText(/Das Passwort ist gesetzt/i);

    await benutzerIn.click(screen.getByRole("button", { name: "Zur Anmeldung" }));
    expect(abgemeldet).toHaveBeenCalledTimes(1);
  });

  test("sagt vorher, dass alle Geräte abgemeldet werden", async () => {
    // Ohne diesen Hinweis ist das Abmelden auf dem Handy eine böse
    // Überraschung statt einer gewollten Wirkung.
    rendere();
    expect(screen.getByText(/auf allen Geräten/i)).toBeInTheDocument();
  });
});

describe("Eingabeprüfung im Browser", () => {
  test("schickt gar nicht erst ab, wenn die Wiederholung abweicht", async () => {
    const senden = vi.spyOn(api, "post").mockResolvedValue({});
    rendere();

    await ausfuellen(ALT, NEU, "etwas-ganz-anderes");

    expect(await screen.findByText(/stimmen nicht überein/i)).toBeInTheDocument();
    expect(senden).not.toHaveBeenCalled();
  });

  test("lehnt ein zu kurzes Passwort ab, ohne den Server zu fragen", async () => {
    const senden = vi.spyOn(api, "post").mockResolvedValue({});
    rendere();

    await ausfuellen(ALT, "kurz", "kurz");

    expect(senden).not.toHaveBeenCalled();
    expect(screen.queryByText(/Das Passwort ist gesetzt/i)).not.toBeInTheDocument();
  });
});

describe("Fehlerfall", () => {
  test("zeigt die Servermeldung und bleibt im Formular", async () => {
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiFehler(400, "falsches_passwort", "Das aktuelle Passwort stimmt nicht."),
    );
    const { abgemeldet } = rendere();

    await ausfuellen();

    expect(await screen.findByText("Das aktuelle Passwort stimmt nicht.")).toBeInTheDocument();
    // Weder abmelden noch Erfolgsseite: der Benutzer soll es nochmal
    // versuchen können, ohne sich neu anzumelden.
    expect(abgemeldet).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Aktuelles Passwort")).toBeInTheDocument();
  });
});
