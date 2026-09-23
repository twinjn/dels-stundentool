/**
 * Tests für den Kopf der Kalkulationsseite.
 *
 * Hier geht es NICHT um die Rechnung, die steckt in rechne() im Paket
 * shared und ist dort getestet. Hier geht es um etwas anderes, das genau
 * so schiefgehen kann: eine richtig gerechnete Zahl, die falsch
 * präsentiert wird.
 *
 * Im laufenden Monat haben die meisten Objekte noch keine Stunden. Ihr
 * Abo steht dann im Umsatz, ohne dass Lohnkosten dagegenstehen, und die
 * Marge sieht glänzend aus. Mit echten Daten gesehen: Ergebnis 35'150,
 * Marge 56.4 Prozent, dabei hatten 34 von 35 Objekten null Stunden.
 *
 * Die Regel, die diese Tests festhalten: solange die Basis unvollständig
 * ist, bekommt das Ergebnis keine Farbe und die Warnung steht darüber,
 * nicht darunter. Grün heisst "gut gelaufen", und das wäre eine
 * Aussage über einen Monat, von dem die Hälfte fehlt.
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
  abgeschlossenAm: null,
  abgeschlossenVon: null,
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

/**
 * Antwortet je nach Pfad: Monatsliste, Monat, Abgleich.
 *
 * Der Abgleich wird beim Laden des Monats gleich mitgeholt, deshalb
 * muss die Attrappe ihn kennen. Ohne eigenen Zweig bekäme sie die
 * Monatsdaten auch auf /abgleich zurück, und die Seite stürzte an
 * einer Stelle ab, die mit dem geprüften Verhalten nichts zu tun hat.
 */
function antworten(daten: Record<string, unknown>, unterschiede: unknown[] = []) {
  vi.spyOn(api, "get").mockImplementation((pfad: string) => {
    if (pfad === "/kalkulation/monate") {
      return Promise.resolve([{ monat: "2026-09-01", notiz: null }] as never);
    }
    if (pfad.endsWith("/abgleich")) {
      return Promise.resolve({
        monat: "2026-09-01",
        abgeschlossen: false,
        unterschiede,
      } as never);
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
    // Keine Einträge: das eine Objekt hat kein einziges Stundenkonto.
    antworten(monatsdaten());
  });

  test("warnt, und die Warnung steht vor den Kacheln", async () => {
    const { container } = rendereAngemeldet(<KalkulationSeite />);
    const warnung = await screen.findByText(/keine Stunden/i);

    expect(warnung).toBeInTheDocument();

    /*
     * Reihenfolge im Dokument prüfen, nicht nur Vorhandensein. Vorher
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
    // grün und rot sind Bewertungen. Bewerten kann man erst, wenn die
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

  test("färbt das Ergebnis wieder ein", async () => {
    rendereAngemeldet(<KalkulationSeite />);
    const kachel = await ergebniskachel();

    expect(kachel).not.toHaveClass("kachel-unsicher");
    expect(within(kachel).queryByText(/unvollständiger Erfassung/i)).not.toBeInTheDocument();
  });
});

describe("Person mit Stunden, aber ohne Stundenlohn", () => {
  test("zählt als unvollständige Basis", async () => {
    /*
     * Der zweite Weg, auf dem das Ergebnis zu gut wird: wer Stunden
     * erfasst hat, aber keinen hinterlegten Lohn, fällt mit null Franken
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

describe("Abgeschlossener Monat", () => {
  test("zeigt das Band, sperrt die Felder und bietet das Öffnen an", async () => {
    antworten(
      monatsdaten({
        ansaetze: {
          ...ANSAETZE,
          abgeschlossenAm: "2026-10-05T08:00:00.000Z",
          abgeschlossenVon: "Twin",
        },
      }),
    );

    rendereAngemeldet(<KalkulationSeite />);

    expect(await screen.findByText(/ist abgeschlossen/i)).toBeInTheDocument();
    expect(screen.getByText(/Twin/)).toBeInTheDocument();

    // Der Knopf bietet das Gegenteil an, nicht noch einmal dasselbe.
    expect(screen.getByRole("button", { name: /Wieder öffnen/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Monat abschliessen/i })).toBeNull();

    // Das Abo-Feld nimmt nichts mehr an.
    const felder = document.querySelectorAll<HTMLInputElement>("input.wertfeld");
    expect(felder.length).toBeGreaterThan(0);
    for (const feld of felder) expect(feld.readOnly).toBe(true);

    // Der Haken für "aktiv" ebenso.
    const haken = screen.getByLabelText(/Objekt Eins aktiv/i) as HTMLInputElement;
    expect(haken.disabled).toBe(true);
  });

  test("ein offener Monat zeigt den Abschluss-Knopf und offene Felder", async () => {
    antworten(monatsdaten());
    rendereAngemeldet(<KalkulationSeite />);

    expect(await screen.findByRole("button", { name: /Monat abschliessen/i })).toBeInTheDocument();
    expect(screen.queryByText(/ist abgeschlossen/i)).toBeNull();

    const haken = screen.getByLabelText(/Objekt Eins aktiv/i) as HTMLInputElement;
    expect(haken.disabled).toBe(false);
  });
});

describe("Abgleich", () => {
  test("kein Unterschied, kein Kasten", async () => {
    antworten(monatsdaten());
    const { container } = rendereAngemeldet(<KalkulationSeite />);
    await screen.findByText(/^Ergebnis$/);
    expect(container.querySelector(".abgleich")).toBeNull();
  });

  test("Unterschiede stehen über den Kacheln und sind vorgewählt", async () => {
    antworten(monatsdaten(), [
      {
        art: "objekt_fehlt",
        objektId: "o2",
        objektNr: "10002",
        name: "Objekt Zwei",
        abo: "450.00",
        stunden: 0,
      },
    ]);

    const { container } = rendereAngemeldet(<KalkulationSeite />);

    const kasten = await screen.findByText(/1 Unterschied\(e\)/);
    expect(kasten).toBeInTheDocument();

    // Gleiche Regel wie bei den Warnungen: erst der Vorbehalt, dann
    // die grosse Zahl.
    const kacheln = container.querySelector(".kacheln")!;
    const stellung = kasten.compareDocumentPosition(kacheln);
    expect(stellung & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const haken = screen.getByLabelText(/Objekt Zwei übernehmen/i) as HTMLInputElement;
    expect(haken.checked).toBe(true);
    expect(screen.getByRole("button", { name: /1 Punkt\(e\) übernehmen/i })).toBeInTheDocument();
  });

  test("bei abgeschlossenem Monat ist der Kasten nur noch Information", async () => {
    antworten(
      monatsdaten({
        ansaetze: { ...ANSAETZE, abgeschlossenAm: "2026-10-05T08:00:00.000Z" },
      }),
      [
        {
          art: "abo_weicht_ab",
          objektId: "o1",
          objektNr: "10001",
          name: "Objekt Eins",
          imMonat: "1000.00",
          lautStammdaten: "1100.00",
        },
      ],
    );

    rendereAngemeldet(<KalkulationSeite />);

    await screen.findByText(/1 Unterschied\(e\)/);
    const haken = screen.getByLabelText(/Objekt Eins übernehmen/i) as HTMLInputElement;
    expect(haken.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /übernehmen$/i })).toBeNull();
  });
});
