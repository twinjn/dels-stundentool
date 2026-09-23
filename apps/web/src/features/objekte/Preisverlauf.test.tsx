/**
 * Tests für den Preisverlauf.
 *
 * Der wichtigste Punkt ist die Unterscheidung zwischen einem Preis, der
 * gilt, und einem, der erst gelten wird. Wer die verwechselt, rechnet
 * einen Monat mit einem Betrag, den der Kunde noch gar nicht zahlt.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../api/client.js";
import { rendereAngemeldet } from "../../test/hilfen.js";
import { Preisverlauf } from "./Preisverlauf.js";

const HEUTE = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

const PREISE = [
  {
    id: "p2",
    objektId: "o1",
    gueltigAb: "2099-01-01",
    betrag: "1100.00",
    bemerkung: "Erhöhung",
    erfasstVon: "Twin",
    erstelltAm: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "p1",
    objektId: "o1",
    gueltigAb: HEUTE,
    betrag: "1000.00",
    bemerkung: null,
    erfasstVon: null,
    erstelltAm: "2026-09-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.spyOn(api, "get").mockResolvedValue(PREISE as never);
  vi.spyOn(api, "post").mockResolvedValue({} as never);
  vi.spyOn(api, "delete").mockResolvedValue({} as never);
});

describe("Preisverlauf", () => {
  test("ein Preis in der Zukunft wird als künftig gekennzeichnet", async () => {
    const { container } = rendereAngemeldet(
      <Preisverlauf objektId="o1" darfSchreiben onGeaendert={() => {}} />,
    );

    expect(await screen.findByText(/01\.01\.2099/)).toBeInTheDocument();
    expect(screen.getByText("künftig")).toBeInTheDocument();

    // Der künftige Preis steht blasser da, der heutige nicht.
    const zeilen = container.querySelectorAll(".preisliste li");
    expect(zeilen[0]).toHaveClass("kuenftig");
    expect(zeilen[1]).not.toHaveClass("kuenftig");
  });

  test("ein neuer Preis wird mit Stichtag geschickt", async () => {
    const benutzer = userEvent.setup();
    const gemerkt = vi.fn();

    rendereAngemeldet(<Preisverlauf objektId="o1" darfSchreiben onGeaendert={gemerkt} />);
    await screen.findByText(/01\.01\.2099/);

    await benutzer.type(screen.getByLabelText(/Betrag/i), "1250");
    await benutzer.click(screen.getByRole("button", { name: /Preis eintragen/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [pfad, rumpf] = vi.mocked(api.post).mock.calls[0]!;
    expect(pfad).toBe("/objekte/o1/preise");
    expect(rumpf).toMatchObject({ betrag: "1250", bemerkung: null });
    expect((rumpf as { gueltigAb: string }).gueltigAb).toMatch(/^\d{4}-\d{2}-01$/);

    // Der Stammsatz kann sich geändert haben, also wird oben nachgeladen.
    await waitFor(() => expect(gemerkt).toHaveBeenCalled());
  });

  test("ohne Schreibrecht gibt es weder Eingabe noch Entfernen", async () => {
    rendereAngemeldet(<Preisverlauf objektId="o1" darfSchreiben={false} onGeaendert={() => {}} />);

    await screen.findByText(/01\.01\.2099/);
    expect(screen.queryByRole("button", { name: /Preis eintragen/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /entfernen/i })).toBeNull();
  });
});
