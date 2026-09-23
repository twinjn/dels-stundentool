/**
 * Tests fuer den Kopf der Kalkulationsseite.
 *
 * Hier geht es NICHT um die Rechnung, die steckt in rechne() im Paket
 * shared und ist dort getestet. Hier geht es um etwas anderes, das genau
 * so schiefgehen kann: eine richtig gerechnete Zahl, die falsch
 * praesentiert wird.
 *
 * Im laufenden Monat haben die meisten Objekte noch keine Stunden. Ihr
 * Abo steht dann im Umsatz, ohne dass Lohnkosten dagegenstehen, und die
 * Marge sieht glaenzend aus. Mit echten Daten gesehen: Ergebnis 35'150,
 * Marge 56.4 Prozent, dabei hatten 34 von 35 Objekten null Stunden.
 *
 * Die Regel, die diese Tests festhalten: solange die Basis unvollstaendig
 * ist, bekommt das Ergebnis keine Farbe und die Warnung steht darueber,
 * nicht darunter. Gruen heisst "gut gelaufen", und das waere eine
 * Aussage ueber einen Monat, von dem die Haelfte fehlt.
 */
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../api/client.js";
import { rendereAngemeldet } from "../../test/hilfen.js";
import { KalkulationSeite } from "./KalkulationSeite.js";

const ANSAETZE = {
  ahv: "0.053",
  alv: "0.011",
  nbu: "0.01",
  bu: "0.014494",
  ktgObjekt: "0.008",
  ktgPersonal: "0.008",
  rpk: "0.01",
  fak: "0.002",
  ml13: "0",
  nbuSchwelle: "0",
  nbuTraegtAg: false,
  bvgSatz: "0",
  bvgEintritt: "0",
  bvgKoord: "0",
  bvgMin: "0",
  bvgMax: "0",
  mat: "15",
  mas: "15",
  trs: "0",
  trsTopf: "0",
  trsSchluessel: "abos" as const,
  adminReserve: "0",
  notiz: null,
};

const OBJEKT = {
  objektId: "o1",
  aboBetrag: "1000",
  stdManuell: null,
  lohnManuell: null,
  ma: "1",
  aktiv: true,
  objektNr: "10001",
  objektName: "Objekt Eins",
};

const PERSON = {
  mitarbeiterId: "m1",
  name: "Anna Muster",
  personalnummer: "1001",
  stundenlohnManuell: null,
  aktiv: true,
};

const MITARBEITER = { id: "m1", name: "Anna Muster", stundenlohn: "30.00", monatslohn: null };

function monatsdaten(teil: Record<string, unknown> = {}) {
  return {
    monat: "2026-09-01",
    ansaetze: ANSAETZE,
    objektMonat: [OBJEKT],
    personMonat: [PERSON],
    adminkosten: [],
    eintraege: [],
    mitarbeiter: [MITARBEITER],
    ...teil,
  };
}

/** Antwortet je nach Pfad: erst die Monatsliste, dann der Monat. */
function antworten(daten: Record<string, unknown>) {
  vi.spyOn(api, "get").mockImplementation((pfad: string) => {
    if (pfad === "/kalkulation/monate") {
      return Promise.resolve([{ monat: "2026-09-01", notiz: null }] as never);
    }
    return Promise.resolve(daten as never);
  });
}

async function ergebniskachel(): Promise<HTMLElement> {
  const wert = await screen.findByText(/^Ergebnis$/);
  return wert.closest(".kachel") as HTMLElement;
}

beforeEach(() => {
  vi.spyOn(api, "patch").mockResolvedValue({});
});

describe("Objekt ohne erfasste Stunden", () => {
  beforeEach(() => {
    // Keine Eintraege: das eine Objekt hat kein einziges Stundenkonto.
    antworten(monatsdaten());
  });

  test("warnt, und die Warnung steht vor den Kacheln", async () => {
    const { container } = rendereAngemeldet(<KalkulationSeite />);
    const warnung = await screen.findByText(/keine Stunden/i);

    expect(warnung).toBeInTheDocument();

    /*
     * Reihenfolge im Dokument pruefen, nicht nur Vorhandensein. Vorher
     * stand die Warnung UNTER den Kacheln, und wer von oben nach unten
     * liest, hatte die grosse Zahl dann schon geglaubt.
     */
    const kacheln = container.querySelector(".kacheln")!;
    const stellung = warnung.compareDocumentPosition(kacheln);
    expect(stellung & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("gibt dem Ergebnis keine Farbe", async () => {
    rendereAngemeldet(<KalkulationSeite />);
    const kachel = await ergebniskachel();

    expect(kachel).toHaveClass("kachel-unsicher");
    // gruen und rot sind Bewertungen. Bewerten kann man erst, wenn die
    // Erfassung steht.
    expect(kachel).not.toHaveClass("gruen");
    expect(kachel).not.toHaveClass("rot");
  });

  test("schreibt den Vorbehalt neben die Marge", async () => {
    rendereAngemeldet(<KalkulationSeite />);
    const kachel = await ergebniskachel();
    expect(within(kachel).getByText(/unvollständiger Erfassung/i)).toBeInTheDocument();
  });
});

describe("Vollständig erfasster Monat", () => {
  beforeEach(() => {
    antworten(
      monatsdaten({
        eintraege: [
          {
            mitarbeiterId: "m1",
            objektId: "o1",
            datum: "2026-09-02",
            art: "arbeit",
            wert: "8.00",
          },
        ],
      }),
    );
  });

  test("warnt nicht", async () => {
    rendereAngemeldet(<KalkulationSeite />);
    await ergebniskachel();
    expect(screen.queryByText(/keine Stunden/i)).not.toBeInTheDocument();
  });

  test("faerbt das Ergebnis wieder ein", async () => {
    rendereAngemeldet(<KalkulationSeite />);
    const kachel = await ergebniskachel();

    expect(kachel).not.toHaveClass("kachel-unsicher");
    expect(within(kachel).queryByText(/unvollständiger Erfassung/i)).not.toBeInTheDocument();
  });
});

describe("Person mit Stunden, aber ohne Stundenlohn", () => {
  test("zählt als unvollstaendige Basis", async () => {
    /*
     * Der zweite Weg, auf dem das Ergebnis zu gut wird: wer Stunden
     * erfasst hat, aber keinen hinterlegten Lohn, faellt mit null Franken
     * Lohnaufwand in die Rechnung.
     */
    antworten(
      monatsdaten({
        mitarbeiter: [{ ...MITARBEITER, stundenlohn: null }],
        eintraege: [
          {
            mitarbeiterId: "m1",
            objektId: "o1",
            datum: "2026-09-02",
            art: "arbeit",
            wert: "8.00",
          },
        ],
      }),
    );

    rendereAngemeldet(<KalkulationSeite />);

    expect(await screen.findByText(/keinen Stundenlohn hinterlegt/i)).toBeInTheDocument();
    expect(await ergebniskachel()).toHaveClass("kachel-unsicher");
  });
});
