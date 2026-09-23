/**
 * Hilfen fuer die Tests der Oberflaeche.
 *
 * Kern der Sache: die API wird NICHT wirklich aufgerufen. Statt eines
 * echten Servers steht eine nachgebaute Fassung von api da, die genau
 * die Antworten liefert, die ein Test braucht.
 *
 * Warum nicht gegen den echten Server testen: das macht die API-Tests
 * schon, 243 Stueck davon. Hier geht es um die andere Haelfte, naemlich
 * was die Oberflaeche aus einer Antwort MACHT. Dafuer muss die Antwort
 * frei waehlbar sein, auch Faelle, die man mit echten Daten muehsam
 * herstellen muesste: ein Serverfehler, eine leere Liste, ein Benutzer
 * ohne Lohnrecht.
 */
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { Rolle } from "@dels/shared";
import { AuthKontext, type Benutzer } from "../app/AuthKontext.js";

export function benutzer(rolle: Rolle = "admin", name = "Test Person"): Benutzer {
  return { id: "11111111-1111-4111-8111-111111111111", name, email: "test@dels.ch", rolle };
}

/**
 * Rendert eine Komponente mit angemeldetem Benutzer.
 *
 * Der Kontext wird direkt mit einem Wert gefuellt, statt den echten
 * AuthAnbieter zu benutzen. Der wuerde beim Start /auth/ich abfragen,
 * und dann haette jeder Test eine Ladephase, die ihn nichts angeht.
 */
export function rendereAngemeldet(
  element: ReactElement,
  rolle: Rolle = "admin",
): ReturnType<typeof render> {
  return render(
    <AuthKontext.Provider
      value={{
        benutzer: benutzer(rolle),
        laedt: false,
        serverfehler: null,
        anmelden: vi.fn(),
        abmelden: vi.fn(),
        abgemeldet: vi.fn(),
      }}
    >
      {element}
    </AuthKontext.Provider>,
  );
}
