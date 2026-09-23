/**
 * Mitarbeiter-Stammdaten: Liste links, Formular rechts.
 *
 * Die Lohnfelder erscheinen nur, wenn die Rolle sie sehen darf. Der
 * Server schickt sie sonst ohnehin nicht mit, das Ausblenden hier
 * verhindert nur leere Felder in der Maske.
 */
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { hatRecht } from "@dels/shared";
import type { Lohnart } from "@dels/shared";
import { ApiFehler, api } from "../../api/client.js";
import { ExportKnopf } from "../../components/ExportKnopf.js";
import { useAuth } from "../../app/AuthKontext.js";
import { useListe } from "../../app/useListe.js";
import { Auswahl, Feld, Feldgruppe, Kontrollkaestchen } from "../../components/Feld.js";

export type Mitarbeiter = {
  id: string;
  name: string;
  personalnummer: string | null;
  mitarbeiterstufe: string | null;
  funktion: string | null;
  einsatzort: string | null;
  anrede: string | null;
  eintrittsdatum: string | null;
  austrittsdatum: string | null;
  aktiv: boolean;
  lohnart: Lohnart;
  ferienanspruch: string;
  sollProTag: string;
  telefon: string | null;
  mobil: string | null;
  email: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  geburtsdatum: string | null;
  nationalitaet: string | null;
  ferienSaldo: string | null;
  ferienSaldoStand: string | null;
  ahvNummer: string | null;
  iban: string | null;
  notizen: string | null;
  stundenlohn?: string | null;
  monatslohn?: string | null;
};

const LEER = {
  name: "",
  personalnummer: "",
  mitarbeiterstufe: "",
  funktion: "",
  einsatzort: "",
  anrede: "",
  eintrittsdatum: "",
  austrittsdatum: "",
  aktiv: true,
  lohnart: "stunde",
  ferienanspruch: "25",
  sollProTag: "8.4",
  telefon: "",
  mobil: "",
  email: "",
  strasse: "",
  plz: "",
  ort: "",
  geburtsdatum: "",
  nationalitaet: "",
  ferienSaldo: "",
  ferienSaldoStand: "",
  ahvNummer: "",
  iban: "",
  notizen: "",
  stundenlohn: "",
  monatslohn: "",
};

type Formularwerte = typeof LEER;

function ausMitarbeiter(m: Mitarbeiter): Formularwerte {
  return {
    ...LEER,
    ...Object.fromEntries(
      Object.keys(LEER).map((feld) => {
        const wert = (m as Record<string, unknown>)[feld];
        if (typeof wert === "boolean") return [feld, wert];
        return [feld, wert === null || wert === undefined ? "" : String(wert)];
      }),
    ),
  } as Formularwerte;
}

export function MitarbeiterSeite() {
  const { benutzer } = useAuth();
  const { daten, laedt, fehler, neuLaden } = useListe<Mitarbeiter>("/mitarbeiter");
  const [suche, setSuche] = useState("");
  const [nurAktive, setNurAktive] = useState(true);
  const [auswahl, setAuswahl] = useState<Mitarbeiter | "neu" | null>(null);

  const darfSchreiben = benutzer ? hatRecht(benutzer.rolle, "stammdaten:schreiben") : false;
  const darfLoehne = benutzer ? hatRecht(benutzer.rolle, "loehne:lesen") : false;

  const gefiltert = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    return daten
      .filter((m) => (nurAktive ? m.aktiv : true))
      .filter(
        (m) =>
          begriff === "" ||
          m.name.toLowerCase().includes(begriff) ||
          (m.personalnummer ?? "").toLowerCase().includes(begriff) ||
          (m.ort ?? "").toLowerCase().includes(begriff),
      );
  }, [daten, suche, nurAktive]);

  return (
    <div className="seitenraster">
      <section className="spalte-liste">
        <div className="seitenkopf">
          <h1>Mitarbeiter</h1>
          <div className="kopfhinweise">
            <ExportKnopf
              pfad="/export/stammdaten"
              titel="Mitarbeiter und Objekte als Excel-Datei"
            />
            {darfSchreiben && (
              <button className="knopf" onClick={() => setAuswahl("neu")}>
                Neu
              </button>
            )}
          </div>
        </div>

        <div className="filterzeile">
          <input
            type="search"
            placeholder="Suchen: Name, Personalnummer, Ort"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            aria-label="Mitarbeiter suchen"
          />
          <label className="schalter">
            <input
              type="checkbox"
              checked={nurAktive}
              onChange={(e) => setNurAktive(e.target.checked)}
            />
            nur aktive
          </label>
        </div>

        {fehler && <p className="status status-rot">{fehler}</p>}
        {laedt && <p className="hinweis">Wird geladen ...</p>}

        {!laedt && gefiltert.length === 0 && (
          <p className="hinweis">
            {daten.length === 0 ? "Noch keine Mitarbeiter erfasst." : "Nichts gefunden."}
          </p>
        )}

        {gefiltert.length > 0 && (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Name</th>
                <th>Funktion</th>
                <th>Ort</th>
                {darfLoehne && <th className="rechts">Monatslohn</th>}
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((m) => (
                <tr
                  key={m.id}
                  className={
                    (auswahl !== "neu" && auswahl?.id === m.id ? "gewaehlt " : "") +
                    (m.aktiv ? "" : "inaktiv")
                  }
                  onClick={() => setAuswahl(m)}
                >
                  <td>
                    {m.name}
                    {!m.aktiv && <span className="schild">inaktiv</span>}
                  </td>
                  <td>{m.funktion ?? m.mitarbeiterstufe ?? ""}</td>
                  <td>{m.ort ?? ""}</td>
                  {darfLoehne && <td className="rechts">{m.monatslohn ?? ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="spalte-formular">
        {auswahl ? (
          <MitarbeiterFormular
            key={auswahl === "neu" ? "neu" : auswahl.id}
            vorhanden={auswahl === "neu" ? null : auswahl}
            darfSchreiben={darfSchreiben}
            darfLoehne={darfLoehne}
            onFertig={() => {
              setAuswahl(null);
              neuLaden();
            }}
            onAbbrechen={() => setAuswahl(null)}
          />
        ) : (
          <p className="hinweis">Einen Mitarbeiter auswählen oder oben auf Neu klicken.</p>
        )}
      </section>
    </div>
  );
}

function MitarbeiterFormular({
  vorhanden,
  darfSchreiben,
  darfLoehne,
  onFertig,
  onAbbrechen,
}: {
  vorhanden: Mitarbeiter | null;
  darfSchreiben: boolean;
  darfLoehne: boolean;
  onFertig: () => void;
  onAbbrechen: () => void;
}) {
  const [werte, setWerte] = useState<Formularwerte>(
    vorhanden ? ausMitarbeiter(vorhanden) : { ...LEER },
  );
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldfehler, setFeldfehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);

  function setze<K extends keyof Formularwerte>(feld: K, wert: Formularwerte[K]) {
    setWerte((alt) => ({ ...alt, [feld]: wert }));
  }

  async function speichern(ereignis: FormEvent) {
    ereignis.preventDefault();
    setFehler(null);
    setFeldfehler({});
    setLaeuft(true);

    // Lohnfelder gar nicht erst mitschicken, wenn die Rolle sie nicht darf:
    // der Server würde die Anfrage sonst komplett ablehnen.
    const { stundenlohn, monatslohn, ...rest } = werte;
    const rumpf = darfLoehne ? { ...rest, stundenlohn, monatslohn } : rest;

    try {
      if (vorhanden) {
        await api.patch(`/mitarbeiter/${vorhanden.id}`, rumpf);
      } else {
        await api.post("/mitarbeiter", rumpf);
      }
      onFertig();
    } catch (e: unknown) {
      if (e instanceof ApiFehler) {
        setFehler(e.message);
        setFeldfehler(Object.fromEntries(e.felder.map((f) => [f.feld, f.problem])));
      } else {
        setFehler("Speichern fehlgeschlagen.");
      }
    } finally {
      setLaeuft(false);
    }
  }

  /**
   * Endgültig loeschen.
   *
   * Der Server lässt das nur zu, solange es zu der Person weder Stunden
   * noch Kalkulationszeilen gibt, und antwortet sonst mit 409 und einer
   * Meldung, die auf das Stilllegen verweist. Diese Prüfung gehört
   * dorthin und nicht hierher: die Oberfläche kennt den Datenbestand
   * nicht und könnte ihn zwischen Laden und Klicken ohnehin nicht
   * garantieren.
   *
   * Hier steht nur die Rueckfrage. Sie nennt den Namen, damit niemand
   * aus Versehen den Falschen erwischt, weil er inzwischen in der Liste
   * weitergeklickt hat.
   */
  async function loeschen() {
    if (!vorhanden) return;
    if (!window.confirm(`${vorhanden.name} endgueltig loeschen?`)) return;

    setFehler(null);
    setLaeuft(true);
    try {
      await api.delete(`/mitarbeiter/${vorhanden.id}`);
      onFertig();
    } catch (e: unknown) {
      setFehler(e instanceof ApiFehler ? e.message : "Löschen fehlgeschlagen.");
      setLaeuft(false);
    }
  }

  return (
    <form className="formular" onSubmit={speichern} noValidate>
      <h2>{vorhanden ? vorhanden.name : "Neuer Mitarbeiter"}</h2>

      {fehler && (
        <p className="fehlermeldung" role="alert">
          {fehler}
        </p>
      )}

      <Feldgruppe titel="Person">
        <Feld
          id="name"
          beschriftung="Name"
          wert={werte.name}
          onChange={(w) => setze("name", w)}
          fehler={feldfehler.name}
          breit
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="geburtsdatum"
          beschriftung="Geburtsdatum"
          typ="date"
          wert={werte.geburtsdatum}
          onChange={(w) => setze("geburtsdatum", w)}
          fehler={feldfehler.geburtsdatum}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="anrede"
          beschriftung="Anrede"
          wert={werte.anrede}
          onChange={(w) => setze("anrede", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="nationalitaet"
          beschriftung="Nationalität"
          wert={werte.nationalitaet}
          onChange={(w) => setze("nationalitaet", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="telefon"
          beschriftung="Telefon"
          typ="tel"
          wert={werte.telefon}
          onChange={(w) => setze("telefon", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="mobil"
          beschriftung="Mobil"
          typ="tel"
          wert={werte.mobil}
          onChange={(w) => setze("mobil", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="email"
          beschriftung="E-Mail"
          typ="email"
          wert={werte.email}
          onChange={(w) => setze("email", w)}
          fehler={feldfehler.email}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="strasse"
          beschriftung="Strasse"
          wert={werte.strasse}
          onChange={(w) => setze("strasse", w)}
          breit
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="plz"
          beschriftung="PLZ"
          wert={werte.plz}
          onChange={(w) => setze("plz", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="ort"
          beschriftung="Ort"
          wert={werte.ort}
          onChange={(w) => setze("ort", w)}
          deaktiviert={!darfSchreiben}
        />
      </Feldgruppe>

      <Feldgruppe titel="Anstellung">
        <Feld
          id="personalnummer"
          beschriftung="Personalnummer"
          wert={werte.personalnummer}
          onChange={(w) => setze("personalnummer", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="funktion"
          beschriftung="Funktion"
          wert={werte.funktion}
          onChange={(w) => setze("funktion", w)}
          hinweis="Manager, Aussendienst, Büro, UHR I-III, Hauswart"
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="einsatzort"
          beschriftung="Einsatzort"
          wert={werte.einsatzort}
          onChange={(w) => setze("einsatzort", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="mitarbeiterstufe"
          beschriftung="GAV-Stufe"
          wert={werte.mitarbeiterstufe}
          onChange={(w) => setze("mitarbeiterstufe", w)}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="eintrittsdatum"
          beschriftung="Eintritt"
          typ="date"
          wert={werte.eintrittsdatum}
          onChange={(w) => setze("eintrittsdatum", w)}
          fehler={feldfehler.eintrittsdatum}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="austrittsdatum"
          beschriftung="Austritt"
          typ="date"
          wert={werte.austrittsdatum}
          onChange={(w) => setze("austrittsdatum", w)}
          fehler={feldfehler.austrittsdatum}
          deaktiviert={!darfSchreiben}
        />
        <Auswahl
          id="lohnart"
          beschriftung="Lohnart"
          wert={werte.lohnart}
          moeglichkeiten={[
            { wert: "stunde" as const, text: "Stundenlohn" },
            { wert: "monat" as const, text: "Monatslohn" },
          ]}
          onChange={(w) => setze("lohnart", w)}
          hinweis={
            werte.lohnart === "stunde"
              ? "Ferien werden als Zuschlag auf den Stundenlohn ausbezahlt"
              : "Ferien werden als Saldo in Tagen geführt"
          }
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="ferienanspruch"
          beschriftung="Ferien (Tage/Jahr)"
          wert={werte.ferienanspruch}
          onChange={(w) => setze("ferienanspruch", w)}
          fehler={feldfehler.ferienanspruch}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="sollProTag"
          beschriftung="Soll pro Tag (Std.)"
          wert={werte.sollProTag}
          onChange={(w) => setze("sollProTag", w)}
          fehler={feldfehler.sollProTag}
          deaktiviert={!darfSchreiben}
        />
        <Kontrollkaestchen
          id="aktiv"
          beschriftung="Aktiv"
          wert={werte.aktiv}
          onChange={(w) => setze("aktiv", w)}
        />

        {vorhanden?.ferienSaldo != null && (
          <p className="feldhinweis feld-breit">
            Ferien-Saldo <strong>{vorhanden.ferienSaldo}</strong> Tage, uebernommen aus dem Excel
            mit Stand{" "}
            {vorhanden.ferienSaldoStand
              ? new Date(vorhanden.ferienSaldoStand).toLocaleDateString("de-CH")
              : "unbekannt"}
            . Was seither bezogen wurde, steht in der Stundenerfassung. Die laufende Fortschreibung
            ist noch nicht gebaut, weil dafuer eure Regeln zu Uebertrag und anteiligem Anspruch
            feststehen muessen.
          </p>
        )}
      </Feldgruppe>

      <Feldgruppe titel="Zahlungen und Sozialversicherung">
        <Feld
          id="ahvNummer"
          beschriftung="AHV-Nummer"
          wert={werte.ahvNummer}
          onChange={(w) => setze("ahvNummer", w)}
          hinweis="756.xxxx.xxxx.xx"
          fehler={feldfehler.ahvNummer}
          deaktiviert={!darfSchreiben}
        />
        <Feld
          id="iban"
          beschriftung="IBAN"
          wert={werte.iban}
          onChange={(w) => setze("iban", w)}
          hinweis="Wird auf Zahlendreher geprüft"
          fehler={feldfehler.iban}
          breit
          deaktiviert={!darfSchreiben}
        />
        {darfLoehne && (
          <>
            <Feld
              id="monatslohn"
              beschriftung="Monatslohn (CHF)"
              wert={werte.monatslohn}
              onChange={(w) => setze("monatslohn", w)}
              fehler={feldfehler.monatslohn}
              deaktiviert={!darfSchreiben}
            />
            <Feld
              id="stundenlohn"
              beschriftung="Stundenlohn (CHF)"
              wert={werte.stundenlohn}
              onChange={(w) => setze("stundenlohn", w)}
              fehler={feldfehler.stundenlohn}
              deaktiviert={!darfSchreiben}
            />
          </>
        )}
      </Feldgruppe>

      <div className="formularfuss">
        {/*
          Loeschen steht ganz links und durch den Freiraum abgesetzt
          (siehe .formularfuss-gefahr in styles.css), nicht neben
          "Speichern". Zwei Knoepfe nebeneinander, von denen einer Daten
          vernichtet, sind eine Falle fuer jeden, der schnell klickt.
        */}
        {darfSchreiben && vorhanden && (
          <button
            type="button"
            className="knopf-gefahr formularfuss-gefahr"
            onClick={() => void loeschen()}
            disabled={laeuft}
            title="Geht nur, solange zu dieser Person keine Stunden erfasst sind"
          >
            Loeschen
          </button>
        )}
        <button type="button" className="knopf-leise" onClick={onAbbrechen}>
          Schliessen
        </button>
        {darfSchreiben && (
          <button type="submit" className="knopf" disabled={laeuft}>
            {laeuft ? "Speichert ..." : "Speichern"}
          </button>
        )}
      </div>
    </form>
  );
}
