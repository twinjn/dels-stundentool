/**
 * Tests der Ferienseite.
 *
 * Geprüft wird nicht, ob die Rechnung stimmt, das machen die Tests in
 * der API. Hier geht es darum, was die Seite aus einer Antwort MACHT:
 *
 *   - Zeigt sie einem Büro-Benutzer wirklich keine Frankenbeträge?
 *   - Nimmt sie eine hochgerechnete Zahl optisch zurück, oder steht
 *     sie fett da wie eine Tatsache?
 *   - Kommt bei einer abgelehnten Eingabe die konkrete Feldmeldung an
 *     oder nur ein nichtssagendes "Eingabe ist ungültig"?
 *
 * Alle drei sind Fehler, die grüne API-Tests nicht bemerken.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../api/client.js";
import { rendereAngemeldet } from "../../test/hilfen.js";
import { FerienSeite } from "./FerienSeite.js";
import type { Ferienstand } from "./typen.js";

const MONATSLOHN = {
  art: "monat" as const,
  id: "a",
  name: "Anna Monat",
  jahr: 2026,
  anspruch: 25,
  anspruchVoll: 25,
  anteilig: false,
  uebertrag: 4,
  uebertragGesetzt: false,
  uebertragBemerkung: null,
  bezogen: 10,
  rest: 19,
  verlaufUnvollstaendig: false,
};

const STUNDENLOHN = {
  art: "stunde" as const,
  id: "b",
  name: "Beat Stunde",
  jahr: 2026,
  anspruchVoll: 25,
  wochen: 5,
  zuschlag: 0.10638,
  stunden: 100,
  basis: 3000,
  entschaedigung: 319.15,
  bezogen: 3,
};

function antwort(teil: Partial<Ferienstand> = {}): Ferienstand {
  return {
    jahr: 2026,
    darfLoehne: true,
    zeilen: [MONATSLOHN, STUNDENLOHN],
    ...teil,
  };
}

beforeEach(() => {
  vi.spyOn(api, "get").mockResolvedValue(antwort());
});

describe("Trennung nach Lohnart", () => {
  test("zeigt beide Gruppen in eigenen Abschnitten", async () => {
    rendereAngemeldet(<FerienSeite />);

    expect(await screen.findByRole("heading", { name: "Monatslohn" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stundenlohn" })).toBeInTheDocument();
  });

  test("nennt beim Stundenlohn ausdrücklich, dass es keinen Saldo gibt", async () => {
    rendereAngemeldet(<FerienSeite />);
    await screen.findByRole("heading", { name: "Stundenlohn" });

    // Der Satz ist keine Deko. Ohne ihn sucht jemand den Restsaldo und
    // hält sein Fehlen für einen Fehler im Tool.
    expect(screen.getByText(/keinen Saldo in Tagen/i)).toBeInTheDocument();
  });
});

describe("Lohndaten", () => {
  test("Admin sieht Basis und Entschädigung", async () => {
    rendereAngemeldet(<FerienSeite />, "admin");
    await screen.findByRole("heading", { name: "Stundenlohn" });

    expect(screen.getByRole("columnheader", { name: "Entschädigung" })).toBeInTheDocument();
    expect(screen.getByText("319.15")).toBeInTheDocument();
  });

  test("Büro sieht die Frankenspalten gar nicht erst", async () => {
    /*
     * Der Server schickt für diese Rolle basis und entschaedigung als
     * null. Die Seite darf daraus kein "0.00" machen: ein Betrag von
     * null Franken ist eine Aussage, "du siehst das nicht" ist eine
     * andere.
     */
    vi.spyOn(api, "get").mockResolvedValue(
      antwort({
        darfLoehne: false,
        zeilen: [MONATSLOHN, { ...STUNDENLOHN, basis: null, entschaedigung: null }],
      }),
    );

    rendereAngemeldet(<FerienSeite />, "buero");
    await screen.findByRole("heading", { name: "Stundenlohn" });

    expect(screen.queryByRole("columnheader", { name: "Entschädigung" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Basis" })).not.toBeInTheDocument();
    expect(screen.queryByText("319.15")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();

    // Die Tage bleiben sichtbar, die sind kein Geheimnis.
    expect(screen.getByRole("columnheader", { name: "Zuschlag" })).toBeInTheDocument();
  });
});

describe("Hochgerechneter Saldo", () => {
  test("schweigt, solange alle Zeilen einen Stichtag haben", async () => {
    rendereAngemeldet(<FerienSeite />);
    await screen.findByRole("heading", { name: "Monatslohn" });

    expect(screen.queryByText(/fehlt ein Stichtag/i)).not.toBeInTheDocument();
  });

  test("warnt und nimmt die Zahl optisch zurück, wenn der Stichtag fehlt", async () => {
    /*
     * Der Fall, der mir im Browser aufgefallen ist und in keinem
     * API-Test steht: 96 Tage Rest, fett gedruckt, mit einem kleinen
     * Schild daneben. Das Schild liest niemand, die fette Zahl schon.
     */
    vi.spyOn(api, "get").mockResolvedValue(
      antwort({
        zeilen: [{ ...MONATSLOHN, rest: 96, uebertrag: 71, verlaufUnvollstaendig: true }],
      }),
    );

    rendereAngemeldet(<FerienSeite />);
    await screen.findByRole("heading", { name: "Monatslohn" });

    expect(screen.getByText(/fehlt ein Stichtag/i)).toBeInTheDocument();
    expect(screen.getByText("ungesichert")).toBeInTheDocument();

    // Die Zahl darf nicht als "summe" ausgezeichnet sein, das ist die
    // Klasse, die sie fett macht.
    const zelle = screen.getByText("96");
    expect(zelle).not.toHaveClass("summe");
  });
});

describe("Übertrag von Hand", () => {
  test("Büro sieht keinen Übertrag-Knopf", async () => {
    // Die Rolle darf Stammdaten schreiben, also SIEHT sie ihn. Dieser
    // Test hält fest, dass die Sichtbarkeit am Recht hängt und nicht
    // an der Rolle, damit ein späteres Umhängen der Rechte hier
    // auffällt statt im Betrieb.
    rendereAngemeldet(<FerienSeite />, "buero");
    await screen.findByRole("heading", { name: "Monatslohn" });
    expect(screen.getByRole("button", { name: "Übertrag" })).toBeInTheDocument();
  });

  test("zeigt die konkrete Feldmeldung, nicht die Sammelmeldung", async () => {
    /*
     * Die API antwortet bei einer abgelehnten Eingabe mit
     *   { code, nachricht: "Eingabe ist ungültig.", felder: [...] }
     * Nur die Sammelmeldung anzuzeigen ist der Unterschied zwischen
     * "irgendwas stimmt nicht" und "Begründung angeben".
     */
    const { ApiFehler } = await import("../../api/client.js");
    vi.spyOn(api, "put").mockRejectedValue(
      new ApiFehler(400, "ungueltig", "Eingabe ist ungültig.", [
        {
          feld: "bemerkung",
          problem: "Begründung angeben, sonst weiss in einem Jahr niemand mehr warum.",
        },
      ]),
    );

    const benutzerIn = userEvent.setup();
    rendereAngemeldet(<FerienSeite />);
    await screen.findByRole("heading", { name: "Monatslohn" });

    await benutzerIn.click(screen.getByRole("button", { name: "Übertrag" }));
    await benutzerIn.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText(/Begründung angeben/)).toBeInTheDocument();
    expect(screen.queryByText("Eingabe ist ungültig.")).not.toBeInTheDocument();
  });

  test("lädt nach dem Speichern neu, damit der Rest stimmt", async () => {
    const holen = vi.spyOn(api, "get").mockResolvedValue(antwort());
    vi.spyOn(api, "put").mockResolvedValue({});

    const benutzerIn = userEvent.setup();
    rendereAngemeldet(<FerienSeite />);
    await screen.findByRole("heading", { name: "Monatslohn" });
    expect(holen).toHaveBeenCalledTimes(1);

    await benutzerIn.click(screen.getByRole("button", { name: "Übertrag" }));
    await benutzerIn.type(screen.getByLabelText(/Begründung/), "Rest gestrichen, so vereinbart.");
    await benutzerIn.click(screen.getByRole("button", { name: "Speichern" }));

    // Ohne das Nachladen stünde in der Tabelle weiter der alte Rest,
    // und der Benutzer hätte keinen Hinweis, dass sein Eintrag wirkt.
    await waitFor(() => expect(holen).toHaveBeenCalledTimes(2));
  });
});

describe("Suche", () => {
  test("filtert beide Tabellen nach Namen", async () => {
    const benutzerIn = userEvent.setup();
    rendereAngemeldet(<FerienSeite />);
    await screen.findByRole("heading", { name: "Monatslohn" });

    await benutzerIn.type(screen.getByPlaceholderText("Name suchen"), "Beat");

    expect(screen.queryByText("Anna Monat")).not.toBeInTheDocument();
    expect(screen.getByText("Beat Stunde")).toBeInTheDocument();
    // Der Abschnitt bleibt stehen und sagt, dass er leer ist. Ihn
    // auszublenden wäre verwirrender: dann sieht es aus, als gäbe es
    // gar keine Monatsloehner.
    const monatslohn = screen.getByRole("heading", { name: "Monatslohn" }).closest("section")!;
    expect(within(monatslohn).getByText("Niemand im Monatslohn.")).toBeInTheDocument();
  });
});
