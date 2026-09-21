import React, { useEffect, useMemo, useState } from "react";
import delsLogo from "./assets/dels-logo.png";
import { fmtHours, MONTH_NAMES } from "./format.js";

/* ============================================================
   Startseite

   Kein Begruessungsbildschirm, sondern eine Lagemeldung: was ist
   diesen Monat erfasst, was fehlt noch, und wo geht es weiter.
   Alle Zahlen kommen aus den erfassten Eintraegen, nichts ist
   geschaetzt oder hochgerechnet.
   ============================================================ */

/** Gearbeitete Stunden eines Monats, wahlweise nur bis zu einem Stichtag. */
function stundenImMonat(entries, jahr, monat, bisTag) {
  let summe = 0;
  for (const e of entries) {
    if (e.type !== "arbeit") continue;
    const [y, m, d] = e.date.split("-").map(Number);
    if (y === jahr && m === monat && (!bisTag || d <= bisTag)) summe += Number(e.value) || 0;
  }
  return summe;
}

/** Veraenderung gegenueber dem Vormonat, als Text mit Richtung. */
function trend(jetzt, vorher) {
  if (!vorher) return null;
  const anteil = (jetzt - vorher) / vorher;
  if (Math.abs(anteil) < 0.005) return { richtung: "gleich", text: "gleich wie im Vormonat" };
  const prozent = Math.abs(anteil * 100).toFixed(0);
  return anteil > 0
    ? { richtung: "hoch", text: `${prozent} % mehr als im Vormonat` }
    : { richtung: "runter", text: `${prozent} % weniger als im Vormonat` };
}

function Kennzahl({ label, wert, einheit, hinweis, hinweisArt }) {
  return (
    <div className="kennzahl">
      <div className="kennzahl-label">{label}</div>
      <div className="kennzahl-wert">
        {wert}
        {einheit && <span className="kennzahl-einheit">{einheit}</span>}
      </div>
      {hinweis && <div className={`kennzahl-hinweis ${hinweisArt || ""}`}>{hinweis}</div>}
    </div>
  );
}

function Aufgabe({ anzahl, titel, namen, onClick }) {
  return (
    <button className="aufgabe" onClick={onClick}>
      <span className="aufgabe-zahl">{anzahl}</span>
      <span className="aufgabe-text">
        <span className="aufgabe-titel">{titel}</span>
        <span className="aufgabe-namen">{namen}</span>
      </span>
      <span className="aufgabe-pfeil" aria-hidden="true">→</span>
    </button>
  );
}

export default function Dashboard({
  employees, objekte, entries, monthTotals, yearFerienUsed, onGo, onLogout, email,
}) {
  const [jetzt, setJetzt] = useState(new Date());
  useEffect(() => {
    // Nur damit das Datum nach Mitternacht nicht stehen bleibt.
    const id = setInterval(() => setJetzt(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const jahr = jetzt.getFullYear();
  const monatIdx = jetzt.getMonth();
  const tag = jetzt.getDate();
  const datumLang = jetzt.toLocaleDateString("de-CH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const zahlen = useMemo(() => {
    const vorMonatIdx = monatIdx === 0 ? 11 : monatIdx - 1;
    const vorJahr = monatIdx === 0 ? jahr - 1 : jahr;

    // Der laufende Monat ist noch nicht zu Ende. Deshalb gegen denselben
    // Stichtag im Vormonat vergleichen, sonst sieht jeder Monatsanfang
    // nach einem Einbruch aus.
    const std = stundenImMonat(entries, jahr, monatIdx + 1, tag);
    const stdVorher = stundenImMonat(entries, vorJahr, vorMonatIdx + 1, tag);

    let absenzTage = 0;
    const ohneErfassung = [];
    const ferienMinus = [];
    for (const e of employees) {
      const t = monthTotals(e.id, jahr, monatIdx);
      absenzTage += t.ferien + t.krankheit + t.unfall;
      if (!t.arbeit) ohneErfassung.push(e);
      const rest = Number(e.ferienanspruch || 0) - yearFerienUsed(e.id, jahr);
      if (rest < 0) ferienMinus.push({ ...e, rest });
    }

    const objekteMitStunden = new Set();
    for (const e of entries) {
      if (e.type !== "arbeit" || !e.objekt_id) continue;
      const [y, m] = e.date.split("-").map(Number);
      if (y === jahr && m === monatIdx + 1) objekteMitStunden.add(e.objekt_id);
    }

    // Ohne Stundenlohn zaehlt die Person in der Kalkulation mit 0 Franken
    // Lohnkosten mit. Das verfaelscht jeden Deckungsbeitrag.
    const ohneLohn = employees.filter(
      (e) => e.mitarbeiterstufe !== "Monatslohn" && !Number(e.stundenlohn)
    );

    return {
      std, trendStd: trend(std, stdVorher), absenzTage,
      ohneErfassung, ferienMinus, ohneLohn,
      objekteMitStunden: objekteMitStunden.size,
    };
  }, [entries, employees, jahr, monatIdx, tag, monthTotals, yearFerienUsed]);

  /* Wohin die Zeit in diesem Monat geht. Absolute Stunden und der Anteil
     an der groessten Position, damit die Balken vergleichbar sind. */
  const topObjekte = useMemo(() => {
    const proObjekt = new Map();
    for (const e of entries) {
      if (e.type !== "arbeit" || !e.objekt_id) continue;
      const [y, m] = e.date.split("-").map(Number);
      if (y !== jahr || m !== monatIdx + 1) continue;
      proObjekt.set(e.objekt_id, (proObjekt.get(e.objekt_id) || 0) + (Number(e.value) || 0));
    }
    const namen = new Map(objekte.map((o) => [o.id, o.name]));
    const liste = [...proObjekt.entries()]
      .map(([id, std]) => ({ id, std, name: namen.get(id) || "Unbekanntes Objekt" }))
      .sort((a, b) => b.std - a.std);
    const groesste = liste.length ? liste[0].std : 0;
    return { zeilen: liste.slice(0, 6), groesste, gesamt: liste.length };
  }, [entries, objekte, jahr, monatIdx]);

  const namenListe = (liste, wieViele = 3) => {
    const namen = liste.slice(0, wieViele).map((e) => e.name).join(", ");
    return liste.length > wieViele ? `${namen} und ${liste.length - wieViele} weitere` : namen;
  };

  const aufgaben = [];
  if (zahlen.ferienMinus.length) {
    aufgaben.push({
      key: "ferien",
      anzahl: zahlen.ferienMinus.length,
      titel: "Mitarbeitende mit negativem Ferien-Saldo",
      namen: zahlen.ferienMinus.map((e) => `${e.name} (${fmtHours(e.rest)} Tage)`).join(", "),
      ziel: () => onGo("stundentool", "uebersicht"),
    });
  }
  if (zahlen.ohneErfassung.length) {
    aufgaben.push({
      key: "erfassung",
      anzahl: zahlen.ohneErfassung.length,
      titel: "Mitarbeitende ohne erfasste Stunden in diesem Monat",
      namen: namenListe(zahlen.ohneErfassung),
      ziel: () => onGo("objekte", "erfassung"),
    });
  }
  if (zahlen.ohneLohn.length) {
    aufgaben.push({
      key: "lohn",
      anzahl: zahlen.ohneLohn.length,
      titel: "Mitarbeitende ohne hinterlegten Stundenlohn",
      namen: `${namenListe(zahlen.ohneLohn)} · zählen in der Kalkulation mit 0 CHF`,
      ziel: () => onGo("stundentool", "stammdaten"),
    });
  }

  /* Die drei Gebiete der Anwendung, jedes mit seinen Unterseiten. So ist
     der ganze Aufbau von der Startseite aus sichtbar und direkt erreichbar. */
  const gebiete = [
    {
      titel: "Stundentool",
      zweck: "Arbeitszeit, Ferien und Absenzen pro Mitarbeiter",
      seiten: [
        { name: "Monatsübersicht", zu: ["stundentool", "uebersicht"] },
        { name: "Mitarbeiterdaten", zu: ["stundentool", "stammdaten"] },
      ],
    },
    {
      titel: "Objekte",
      zweck: "Reinigungsobjekte und die Stunden pro Standort",
      seiten: [
        { name: "Stunden erfassen", zu: ["objekte", "erfassung"] },
        { name: "Monatsübersicht", zu: ["objekte", "uebersicht"] },
        { name: "Absenzen und Spesen", zu: ["objekte", "absenzen"] },
      ],
    },
    {
      titel: "Kalkulation",
      zweck: "Deckungsbeitrag und Ergebnis pro Monat",
      seiten: [
        { name: "Objekte", zu: ["kalkulation", "objekte"] },
        { name: "Festpersonal", zu: ["kalkulation", "personal"] },
        { name: "Ansätze und Kosten", zu: ["kalkulation", "ansaetze"] },
        { name: "Ergebnis", zu: ["kalkulation", "ergebnis"] },
      ],
    },
  ];

  return (
    <div className="start">
      <header className="start-band">
        <img src={delsLogo} alt="DELS Reinigung &amp; Beratung" className="start-logo" />
        <div className="start-band-rechts">
          <span className="start-user">{email}</span>
          <button className="link-btn" onClick={onLogout}>Abmelden</button>
        </div>
      </header>

      <main className="start-inhalt">
        <div className="start-titelzeile">
          <div>
            <h1 className="start-titel">Willkommen zurück</h1>
            <div className="start-datum">{datumLang}</div>
          </div>
          <div className="start-monat">{MONTH_NAMES[monatIdx]} {jahr}</div>
        </div>

        <h2 className="start-abschnitt">Dieser Monat</h2>
        <section className="kennzahlen">
          <Kennzahl
            label="Gearbeitete Stunden"
            wert={fmtHours(zahlen.std)}
            hinweis={zahlen.trendStd ? zahlen.trendStd.text : "kein Vormonat zum Vergleich"}
            hinweisArt={zahlen.trendStd ? zahlen.trendStd.richtung : ""}
          />
          <Kennzahl
            label="Absenztage"
            wert={fmtHours(zahlen.absenzTage)}
            hinweis="Ferien, Krankheit und Unfall"
          />
          <Kennzahl
            label="Mitarbeitende erfasst"
            wert={employees.length - zahlen.ohneErfassung.length}
            einheit={`von ${employees.length}`}
            hinweis={zahlen.ohneErfassung.length ? `${zahlen.ohneErfassung.length} noch ohne Eintrag` : "alle erfasst"}
            hinweisArt={zahlen.ohneErfassung.length ? "offen" : "hoch"}
          />
          <Kennzahl
            label="Objekte bebucht"
            wert={zahlen.objekteMitStunden}
            einheit={`von ${objekte.length}`}
            hinweis="mit Stunden in diesem Monat"
          />
        </section>

        <h2 className="start-abschnitt">Bereiche</h2>
        <section className="gebiete">
          {gebiete.map((g) => (
            <article key={g.titel} className="gebiet">
              <button className="gebiet-kopf" onClick={() => onGo(...g.seiten[0].zu)}>
                <span className="gebiet-titel">{g.titel}</span>
                <span className="gebiet-zweck">{g.zweck}</span>
              </button>
              <div className="gebiet-seiten">
                {g.seiten.map((seite) => (
                  <button key={seite.name} className="gebiet-seite" onClick={() => onGo(...seite.zu)}>
                    <span>{seite.name}</span>
                    <span className="gebiet-pfeil" aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </section>

        <div className="start-spalten">
          <section className="start-karte">
            <h2 className="start-karte-titel">Zu erledigen</h2>
            {aufgaben.length ? (
              <div className="aufgaben">
                {aufgaben.map((a) => (
                  <Aufgabe key={a.key} anzahl={a.anzahl} titel={a.titel} namen={a.namen} onClick={a.ziel} />
                ))}
              </div>
            ) : (
              <p className="start-leer">
                Nichts offen. Alle Mitarbeitenden haben Einträge in diesem Monat, die
                Ferien-Saldi sind im Plus und die Stundenlöhne sind hinterlegt.
              </p>
            )}
          </section>

          <section className="start-karte">
            <h2 className="start-karte-titel">Stunden nach Objekt</h2>
            {topObjekte.zeilen.length ? (
              <>
                <div className="objektliste">
                  {topObjekte.zeilen.map((o) => (
                    <div key={o.id} className="objektzeile">
                      <div className="objektzeile-kopf">
                        <span className="objektzeile-name" title={o.name}>{o.name}</span>
                        <span className="objektzeile-std">{fmtHours(o.std)}</span>
                      </div>
                      <div className="objektbalken">
                        <div
                          className="objektbalken-fuell"
                          style={{ width: `${topObjekte.groesste ? (o.std / topObjekte.groesste) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {topObjekte.gesamt > topObjekte.zeilen.length && (
                  <p className="objektliste-rest">
                    und {topObjekte.gesamt - topObjekte.zeilen.length} weitere Objekte mit Stunden
                  </p>
                )}
              </>
            ) : (
              <p className="start-leer">In diesem Monat sind noch keine Stunden auf Objekte gebucht.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
