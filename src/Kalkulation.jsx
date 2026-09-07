import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { rechne, chf, chf0, pct, vorzeichen, monatName, z } from "./kalkulation";

/* Zahl aus einem Eingabefeld lesen: Hochkomma und Komma erlaubt. */
function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/'/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** Eingabefeld, das erst beim Verlassen speichert. */
function Feld({ wert, onSave, breit, text }) {
  const [v, setV] = useState(wert ?? "");
  useEffect(() => { setV(wert ?? ""); }, [wert]);
  return (
    <input
      className="kalk-input"
      style={{ width: breit || 96, textAlign: text ? "left" : "right" }}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const neu = text ? v : parseNum(v);
        const alt = text ? (wert ?? "") : (wert ?? null);
        if (String(neu ?? "") !== String(alt ?? "")) onSave(neu);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

export default function Kalkulation({ tab, objekte, employees, entries, showToast }) {
  const [monate, setMonate] = useState([]);
  const [monat, setMonat] = useState(null);
  const [s, setS] = useState(null);
  const [objektMonat, setObjektMonat] = useState([]);
  const [personMonat, setPersonMonat] = useState([]);
  const [adminkosten, setAdminkosten] = useState([]);
  const [alleMonate, setAlleMonate] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [details, setDetails] = useState(false);

  const objektById = useMemo(() => new Map(objekte.map((o) => [o.id, o])), [objekte]);
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  /* ---------- Laden ---------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("kalk_monat").select("monat").order("monat");
      const liste = (data || []).map((r) => r.monat);
      setMonate(liste);
      setMonat((m) => m || liste[liste.length - 1] || null);
      if (!liste.length) setLaedt(false);
    })();
  }, []);

  async function ladeMonat(m) {
    if (!m) return;
    setLaedt(true);
    const [mo, om, pm, ak] = await Promise.all([
      supabase.from("kalk_monat").select("*").eq("monat", m).single(),
      supabase.from("kalk_objekt_monat").select("*").eq("monat", m),
      supabase.from("kalk_person_monat").select("*").eq("monat", m),
      supabase.from("kalk_adminkosten").select("*").eq("monat", m).order("sortierung"),
    ]);
    setS(mo.data || null);
    setObjektMonat(om.data || []);
    setPersonMonat(pm.data || []);
    setAdminkosten(ak.data || []);
    setLaedt(false);
  }
  useEffect(() => { ladeMonat(monat); }, [monat]);

  /* Alle Monate fuer den Vergleich. Nur laden, wenn die Tabelle auch sichtbar
     ist -- sonst wuerde jede einzelne Eingabe vier Tabellen neu abfragen. Der
     gerade bearbeitete Monat wird beim Rendern aus dem lokalen Stand ersetzt,
     damit die Zeile trotzdem sofort mitzieht. */
  useEffect(() => {
    if (!monate.length || tab !== "ergebnis") return;
    (async () => {
      const [mo, om, pm, ak] = await Promise.all([
        supabase.from("kalk_monat").select("*"),
        supabase.from("kalk_objekt_monat").select("*"),
        supabase.from("kalk_person_monat").select("*"),
        supabase.from("kalk_adminkosten").select("*"),
      ]);
      setAlleMonate((mo.data || []).sort((a, b) => a.monat.localeCompare(b.monat)).map((m) => ({
        s: m,
        objektMonat: (om.data || []).filter((r) => r.monat === m.monat),
        personMonat: (pm.data || []).filter((r) => r.monat === m.monat),
        adminkosten: (ak.data || []).filter((r) => r.monat === m.monat),
      })));
    })();
  }, [monate, tab]);

  /* ---------- Speichern ---------- */
  async function setzeAnsatz(feld, wert) {
    setS((p) => ({ ...p, [feld]: wert }));
    const { error } = await supabase.from("kalk_monat").update({ [feld]: wert }).eq("monat", monat);
    if (error) showToast("Fehler beim Speichern."); else showToast("Gespeichert");
  }
  async function setzeObjekt(objektId, feld, wert) {
    setObjektMonat((p) => p.map((r) => (r.objekt_id === objektId ? { ...r, [feld]: wert } : r)));
    const { error } = await supabase.from("kalk_objekt_monat").update({ [feld]: wert })
      .eq("monat", monat).eq("objekt_id", objektId);
    if (error) showToast("Fehler beim Speichern.");
  }
  async function setzePerson(employeeId, feld, wert) {
    setPersonMonat((p) => p.map((r) => (r.employee_id === employeeId ? { ...r, [feld]: wert } : r)));
    const { error } = await supabase.from("kalk_person_monat").update({ [feld]: wert })
      .eq("monat", monat).eq("employee_id", employeeId);
    if (error) showToast("Fehler beim Speichern.");
  }
  async function setzeAdmin(id, feld, wert) {
    setAdminkosten((p) => p.map((r) => (r.id === id ? { ...r, [feld]: wert } : r)));
    const { error } = await supabase.from("kalk_adminkosten").update({ [feld]: wert }).eq("id", id);
    if (error) showToast("Fehler beim Speichern.");
  }
  async function adminHinzu() {
    const sort = adminkosten.reduce((a, r) => Math.max(a, r.sortierung), -1) + 1;
    const { data, error } = await supabase.from("kalk_adminkosten")
      .insert({ monat, position: "", betrag: 0, sortierung: sort }).select().single();
    if (error) return showToast("Fehler beim Anlegen.");
    setAdminkosten((p) => [...p, data]);
  }
  async function adminWeg(id) {
    const { error } = await supabase.from("kalk_adminkosten").delete().eq("id", id);
    if (error) return showToast("Fehler beim Löschen.");
    setAdminkosten((p) => p.filter((r) => r.id !== id));
  }
  async function objektHinzu(objektId) {
    const o = objektById.get(objektId);
    const { data, error } = await supabase.from("kalk_objekt_monat")
      .insert({ monat, objekt_id: objektId, abo_betrag: o?.abo_betrag ?? null, ma: 1, aktiv: true })
      .select().single();
    if (error) return showToast("Objekt ist in diesem Monat bereits erfasst.");
    setObjektMonat((p) => [...p, data]);
    showToast("Objekt hinzugefügt");
  }
  async function objektWeg(objektId) {
    const { error } = await supabase.from("kalk_objekt_monat").delete()
      .eq("monat", monat).eq("objekt_id", objektId);
    if (error) return showToast("Fehler beim Löschen.");
    setObjektMonat((p) => p.filter((r) => r.objekt_id !== objektId));
  }
  async function personHinzu(employeeId) {
    const e = empById.get(employeeId);
    const { data, error } = await supabase.from("kalk_person_monat")
      .insert({ monat, employee_id: employeeId, lohn: z(Number(e?.monatslohn)) }).select().single();
    if (error) return showToast("Person ist bereits erfasst.");
    setPersonMonat((p) => [...p, data]);
  }
  async function personWeg(employeeId) {
    const { error } = await supabase.from("kalk_person_monat").delete()
      .eq("monat", monat).eq("employee_id", employeeId);
    if (error) return showToast("Fehler beim Löschen.");
    setPersonMonat((p) => p.filter((r) => r.employee_id !== employeeId));
  }

  /** Neuen Monat aus den Stammdaten anlegen, Vormonat als Vorlage. */
  async function monatAnlegen() {
    const letzter = monate[monate.length - 1];
    // Bewusst mit Zahlen statt mit Date gerechnet: `new Date("2026-02-01")`
    // ist UTC-Mitternacht, `setMonth` rechnet aber lokal. Westlich von
    // Greenwich sprang der Zaehler dadurch ueber einen Monat hinweg.
    let jahr, monatNr;
    if (letzter) {
      const [jj, mm] = letzter.split("-").map(Number);
      jahr = jj;
      monatNr = mm + 1;              // der Monat nach dem letzten erfassten
    } else {
      const heute = new Date();
      jahr = heute.getFullYear();
      monatNr = heute.getMonth() + 1; // ohne Vorlage: der laufende Monat
    }
    if (monatNr > 12) { monatNr = 1; jahr += 1; }
    const neu = `${jahr}-${String(monatNr).padStart(2, "0")}-01`;
    if (monate.includes(neu)) return showToast("Monat existiert bereits.");

    const vorlage = letzter ? { ...s, monat: neu, created_at: undefined, notiz: null } : { monat: neu };
    const { error } = await supabase.from("kalk_monat").insert(vorlage);
    if (error) return showToast("Fehler beim Anlegen.");

    if (letzter) {
      await supabase.from("kalk_objekt_monat").insert(objektMonat.map((r) => ({
        monat: neu, objekt_id: r.objekt_id, abo_betrag: r.abo_betrag,
        std_manuell: r.std_manuell, lohn_manuell: r.lohn_manuell, ma: r.ma, aktiv: r.aktiv,
      })));
      await supabase.from("kalk_person_monat").insert(personMonat.map((r) => ({
        monat: neu, employee_id: r.employee_id, lohn: r.lohn, spesen: r.spesen, ml13: r.ml13,
        abzug_ahv: r.abzug_ahv, abzug_alv: r.abzug_alv, abzug_rpk: r.abzug_rpk,
        abzug_fak: r.abzug_fak, fak_manuell: r.fak_manuell, bvg: r.bvg, bvg_manuell: r.bvg_manuell,
      })));
      await supabase.from("kalk_adminkosten").insert(adminkosten.map((r) => ({
        monat: neu, position: r.position, betrag: r.betrag, sortierung: r.sortierung,
      })));
    }
    setMonate((p) => [...p, neu].sort());
    setMonat(neu);
    showToast(`${monatName(neu)} angelegt`);
  }

  /* ---------- Rechnen ---------- */
  const c = useMemo(() => {
    if (!s) return null;
    return rechne({ monat, s, objektMonat, personMonat, adminkosten, entries, employees });
  }, [s, objektMonat, personMonat, adminkosten, entries, employees, monat]);

  if (laedt) return <div className="loading">Kalkulation wird geladen…</div>;
  if (!s) {
    return (
      <div className="sheet">
        <div className="empty">
          Für die Kalkulation ist noch kein Monat angelegt.
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={monatAnlegen}>Ersten Monat anlegen</button>
          </div>
        </div>
      </div>
    );
  }

  const t = c.t, r = c.res;
  const zwischen = adminkosten.reduce((a, p) => a + z(Number(p.betrag)), 0);

  const kopf = (
    <div className="main-header">
      <div className="month-nav">
        <select value={monat} onChange={(e) => setMonat(e.target.value)}>
          {monate.map((m) => <option key={m} value={m}>{monatName(m)}</option>)}
        </select>
        <button className="btn" onClick={monatAnlegen}>Neuer Monat</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s5)" }}>
        {tab === "objekte" && (
          <label style={{ display: "flex", alignItems: "center", gap: "var(--s2)", margin: 0, cursor: "pointer" }}>
            <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} />
            Kostenspalten zeigen
          </label>
        )}
        <div className="page-title">Kalkulation · {monatName(monat)}</div>
      </div>
    </div>
  );

  const kpis = (
    <div className="stats">
      <div className="stat"><div className="label">Abos (Umsatz)</div><div className="value">{chf0(t.abos)}</div>
        <div className="sub">{objektMonat.length} Objekte</div></div>
      <div className="stat"><div className="label">Löhne inkl. Sozialabgaben</div><div className="value">{chf0(t.lohnSzAlle)}</div>
        <div className="sub">Objekte {chf0(t.lohnSzObj)} · Personal {chf0(t.lohnSzPers)}</div></div>
      <div className="stat"><div className="label">Deckungsbeitrag Objekte</div>
        <div className={`value ${vorzeichen(t.gew)}`}>{chf0(t.gew)}</div>
        <div className="sub">{pct(r.gewProzent)} der verrechneten Abos</div></div>
      <div className="stat"><div className="label">Ergebnis Gesamtbetrieb</div>
        <div className={`value ${vorzeichen(r.ergebnis)}`}>{chf0(r.ergebnis)}</div>
        <div className="sub">Marge {pct(r.marge)}</div></div>
      <div className="stat"><div className="label">Stunden im Monat</div><div className="value">{chf0(t.stdTotal)}</div>
        <div className="sub">{t.ausErfassung} Objekte aus Erfassung, {r.ohneStd} ohne Stunden</div></div>
    </div>
  );

  /* ---------- Objekte ---------- */
  if (tab === "objekte") {
    // Objekte aus den Stammdaten, die diesem Monat noch nicht zugeordnet sind.
    const offeneObjekte = objekte.filter((o) => !objektMonat.some((r) => r.objekt_id === o.id));
    const zeilen = [...c.obj].sort((a, b) =>
      (objektById.get(a.o.objekt_id)?.name || "").localeCompare(objektById.get(b.o.objekt_id)?.name || ""));
    return (
      <>{kopf}<div className="main-content">{kpis}
        <div className={`sheet sheet-wide ${details ? "" : "kalk-kompakt"}`}>
          <table className="overview-table">
            <thead><tr>
              <th>aktiv</th><th>Nr.</th><th>Objekt</th><th>Kunde</th>
              <th>Abo</th><th>Std.</th><th>Ansatz</th><th>MA</th>
              <th>Löhne</th><th>+ SZ</th><th>ZT</th>
              {details && <><th>Mat</th><th>Mas</th><th>Trs</th><th>Admin</th></>}
              <th>%</th><th className="col-gewinn">Gewinn</th><th></th>
            </tr></thead>
            <tbody>
              {zeilen.map((x) => {
                const o = objektById.get(x.o.objekt_id) || {};
                const rel = x.abo ? x.gew / x.abo : 0;
                return (
                  <tr key={x.o.objekt_id} className={!x.o.aktiv ? "row-inaktiv" : x.gew < -0.005 ? "row-neg" : ""}>
                    <td className="cell-num">
                      <input type="checkbox" checked={!!x.o.aktiv}
                        onChange={(e) => setzeObjekt(x.o.objekt_id, "aktiv", e.target.checked)} />
                    </td>
                    <td className="cell-muted">{o.objekt_nr || "–"}</td>
                    <td className="cell-name cell-trunc" title={o.name}>{o.name}</td>
                    <td className="cell-muted cell-trunc" title={o.kunde}>{o.kunde}</td>
                    <td className="cell-num"><Feld wert={x.o.abo_betrag} onSave={(v) => setzeObjekt(x.o.objekt_id, "abo_betrag", v)} /></td>
                    <td className="cell-num">
                      {x.ausErfassung
                        ? <span className="badge-erfasst" title={`aus ${x.personen} erfassten Mitarbeitenden`}>⏱ {chf(x.std)}</span>
                        : <Feld wert={x.o.std_manuell} onSave={(v) => setzeObjekt(x.o.objekt_id, "std_manuell", v)} />}
                    </td>
                    <td className="cell-num">
                      {x.ausErfassung
                        ? <span className="cell-muted">{x.std ? chf(x.loehne / x.std) : ""}</span>
                        : <Feld wert={x.o.lohn_manuell} onSave={(v) => setzeObjekt(x.o.objekt_id, "lohn_manuell", v)} />}
                    </td>
                    <td className="cell-num"><Feld wert={x.o.ma} breit={50} onSave={(v) => setzeObjekt(x.o.objekt_id, "ma", v ?? 1)} /></td>
                    <td className="cell-num">{chf(x.loehne)}</td>
                    <td className="cell-num">{chf(x.lohnSz)}</td>
                    <td className={`cell-num ${vorzeichen(x.zt)}`}>{chf(x.zt)}</td>
                    {details && <>
                      <td className="cell-num cell-muted">{chf(x.mat)}</td>
                      <td className="cell-num cell-muted">{chf(x.mas)}</td>
                      <td className="cell-num cell-muted">{chf(x.trs)}</td>
                      <td className="cell-num cell-muted">{chf(x.admin)}</td>
                    </>}
                    <td className="cell-num cell-muted">{pct(rel)}</td>
                    <td className={`cell-num col-gewinn ${vorzeichen(x.gew)}`}><b>{chf(x.gew)}</b></td>
                    <td><button className="del-row" title="Objekt aus diesem Monat nehmen"
                                onClick={() => objektWeg(x.o.objekt_id)}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="matrix-foot-row">
              <td></td><td></td><td>Total</td><td></td>
              <td className="cell-num">{chf(t.abos)}</td>
              <td className="cell-num">{chf(t.stdTotal)}</td><td></td>
              <td className="cell-num">{chf0(t.maTotal)}</td>
              <td className="cell-num">{chf(t.loehne)}</td>
              <td className="cell-num">{chf(t.lohnSzAlle)}</td>
              <td className={`cell-num ${vorzeichen(t.zt)}`}>{chf(t.zt)}</td>
              {details && <>
                <td className="cell-num">{chf(t.mat)}</td>
                <td className="cell-num">{chf(t.mas)}</td>
                <td className="cell-num">{chf(t.trs)}</td>
                <td className="cell-num">{chf(t.admin)}</td>
              </>}
              <td className="cell-num">{pct(r.gewProzent)}</td>
              <td className={`cell-num col-gewinn ${vorzeichen(t.gew)}`}>{chf(t.gew)}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
        <div className="hint">
          Objekte mit ⏱ rechnen mit den im Stundentool erfassten Stunden und den Stundenlöhnen der
          erfassten Personen. Bei den übrigen zählt die Handeingabe, bis dort etwas erfasst ist.
          Die Totalzeile summiert die Löhne über Objekte <em>und</em> Personal.
          {t.ohneLohnsatz > 0 && (
            <> <b>Achtung:</b> {t.ohneLohnsatz} erfasste Person(en) haben keinen Stundenlohn hinterlegt
            und steuern deshalb 0 zur Lohnsumme bei.</>
          )}
          <div style={{ marginTop: 8 }}>
            Ein <b>inaktives</b> Objekt zählt in diesem Monat weder Umsatz noch Kosten und bleibt
            auch bei der Verteilung von Administration und Treibstoff aussen vor.
          </div>
          {offeneObjekte.length > 0 && (
            <div style={{ marginTop: 8 }}>
              Objekt in diesen Monat aufnehmen:{" "}
              <select defaultValue="" onChange={(e) => { if (e.target.value) { objektHinzu(e.target.value); e.target.value = ""; } }}>
                <option value="">Objekt wählen…</option>
                {offeneObjekte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div></>
    );
  }

  /* ---------- Personal ---------- */
  if (tab === "personal") {
    const offen = employees.filter((e) => !personMonat.some((p) => p.employee_id === e.id));
    return (
      <>{kopf}<div className="main-content">{kpis}
        <div className="sheet sheet-wide kalk-kompakt">
          <table className="overview-table">
            <thead><tr>
              <th>Name</th><th>Lohn</th><th>Spesen</th><th>13. ML</th>
              <th>AHV</th><th>ALV</th><th>RPK</th><th>FAK</th><th>FAK CHF</th>
              <th>BVG</th><th>BVG CHF</th><th>BU</th><th>KTG</th><th></th><th className="col-gewinn">Löhne + SZ</th>
            </tr></thead>
            <tbody>
              {c.staff.map((x) => {
                const e = empById.get(x.p.employee_id) || {};
                const cb = (f) => (
                  <input type="checkbox" checked={!!x.p[f]}
                    onChange={(ev) => setzePerson(x.p.employee_id, f, ev.target.checked)} />
                );
                return (
                  <tr key={x.p.employee_id}>
                    <td className="cell-name cell-trunc" title={e.name}>{e.name || "–"}</td>
                    <td className="cell-num"><Feld wert={x.p.lohn} onSave={(v) => setzePerson(x.p.employee_id, "lohn", v ?? 0)} /></td>
                    <td className="cell-num"><Feld wert={x.p.spesen} onSave={(v) => setzePerson(x.p.employee_id, "spesen", v ?? 0)} /></td>
                    <td className="cell-num">{cb("ml13")}</td>
                    <td className="cell-num">{cb("abzug_ahv")}</td>
                    <td className="cell-num">{cb("abzug_alv")}</td>
                    <td className="cell-num">{cb("abzug_rpk")}</td>
                    <td className="cell-num">{cb("abzug_fak")}</td>
                    <td className="cell-num">
                      <Feld wert={x.p.fak_manuell} onSave={(v) => setzePerson(x.p.employee_id, "fak_manuell", v)} />
                      <div className="kalk-note">
                        {x.p.fak_manuell == null ? chf(x.fak) : "überschrieben"}</div>
                    </td>
                    <td className="cell-num">{cb("bvg")}</td>
                    <td className="cell-num">
                      <Feld wert={x.p.bvg_manuell} onSave={(v) => setzePerson(x.p.employee_id, "bvg_manuell", v)} />
                      <div className="kalk-note">
                        {x.p.bvg_manuell == null ? chf(x.bvg) : "überschrieben"}</div>
                    </td>
                    <td className="cell-num cell-muted">{chf(x.bu)}</td>
                    <td className="cell-num cell-muted">{chf(x.ktg)}</td>
                    <td><button className="del-row" onClick={() => personWeg(x.p.employee_id)}>×</button></td>
                    <td className="cell-num col-gewinn"><b>{chf(x.lohnSz)}</b></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="matrix-foot-row">
              <td>Total Personal</td>
              <td className="cell-num">{chf(c.staff.reduce((a, x) => a + x.lohn, 0))}</td>
              <td className="cell-num">{chf(t.spesen)}</td>
              <td></td><td></td><td></td><td></td><td></td>
              <td className="cell-num">{chf(t.fak)}</td><td></td>
              <td className="cell-num">{chf(t.bvg)}</td>
              <td className="cell-num">{chf(c.staff.reduce((a, x) => a + x.bu, 0))}</td>
              <td className="cell-num">{chf(c.staff.reduce((a, x) => a + x.ktg, 0))}</td>
              <td></td><td className="cell-num col-gewinn">{chf(t.lohnSzPers)}</td>
            </tr></tfoot>
          </table>
        </div>
        <div className="hint">
          Hier gehört nur Festpersonal hinein, das <em>keine</em> Stunden auf Objekte bucht. Wer im
          Stundentool erfasst wird, ist über die Objektzeilen bereits abgedeckt — beides zusammen
          würde denselben Lohn zweimal abziehen.
          {offen.length > 0 && (
            <div style={{ marginTop: 8 }}>
              Hinzufügen:{" "}
              <select defaultValue="" onChange={(e) => { if (e.target.value) { personHinzu(e.target.value); e.target.value = ""; } }}>
                <option value="">Mitarbeiter wählen…</option>
                {offen.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div></>
    );
  }

  /* ---------- Ansaetze ---------- */
  if (tab === "ansaetze") {
    const satz = (label, feld, prozent, einheit) => (
      <div className="kv" key={feld}>
        <div className="kv-key">{label}</div>
        <Feld wert={prozent ? Number((s[feld] * 100).toFixed(6)) : s[feld]}
              onSave={(v) => setzeAnsatz(feld, prozent ? (v ?? 0) / 100 : v)} />
        <div className="kv-unit">{einheit || (prozent ? "%" : "CHF")}</div>
      </div>
    );
    return (
      <>{kopf}<div className="main-content">
        <div className="kalk-grid">
          <div className="sheet">
            <div className="page-title">Sozialabzüge</div>
            {satz("AHV", "ahv", true)}{satz("ALV", "alv", true)}
            {satz("NBU", "nbu", true)}{satz("BU", "bu", true)}
            {satz("KTG Objekte", "ktg_objekt", true)}{satz("KTG Personal", "ktg_personal", true)}
            {satz("RPK", "rpk", true)}{satz("FAK Arbeitgeber", "fak", true)}
            {satz("13. Monatslohn", "ml13", true)}
            {satz("NBU-Schwelle (Std./Woche)", "nbu_schwelle", false, "Std.")}
            <div className="kv">
              <div className="kv-key">NBU trägt der Arbeitgeber</div>
              <input type="checkbox" checked={!!s.nbu_traegt_ag}
                     onChange={(e) => setzeAnsatz("nbu_traegt_ag", e.target.checked)} />
            </div>
            <div className="hint">
              Nach Art. 91 UVG zahlt der Arbeitnehmer die NBU-Prämie, sie wird ihm vom Lohn abgezogen.
              Nur wenn die Firma sie freiwillig übernimmt, ist sie eine Arbeitgeberkost — dann hier
              einschalten. Die Schwelle von 8 Std./Woche entscheidet, ob überhaupt eine NBU-Deckung
              besteht; sie wird pro Person geprüft, sobald Stunden erfasst sind.
            </div>
          </div>

          <div className="sheet">
            <div className="page-title">BVG</div>
            {satz("Arbeitgeber-Satz auf koord. Lohn", "bvg_satz", true)}
            {satz("Eintrittsschwelle Jahreslohn", "bvg_eintritt", false)}
            {satz("Koordinationsabzug pro Jahr", "bvg_koord", false)}
            {satz("Koord. Lohn Minimum", "bvg_min", false)}
            {satz("Koord. Lohn Maximum", "bvg_max", false)}
          </div>

          <div className="sheet">
            <div className="page-title">Pauschalen pro Objekt</div>
            {satz("Material", "mat", false)}
            {satz("Maschinen", "mas", false)}
            {satz("Transport / Kon. (Pauschale)", "trs", false)}
            {satz("Treibstoff total (wird verteilt)", "trs_topf", false)}
            <div className="kv">
              <div className="kv-key">Treibstoff verteilen</div>
              <select value={s.trs_schluessel} onChange={(e) => setzeAnsatz("trs_schluessel", e.target.value)}>
                <option value="abos">nach Aboanteil</option>
                <option value="objekt">gleichmässig pro Objekt</option>
              </select>
            </div>
            <div className="hint">
              Nach Aboanteil wirkt der Treibstoff wie die Administration, das Ergebnis je Objekt bleibt
              gleich. Gleichmässig pro Objekt belastet kleine Aufträge stärker und bildet ab, dass jede
              Anfahrt gleich viel kostet.
            </div>
          </div>

          <div className="sheet">
            <div className="page-title">Administration</div>
            {adminkosten.map((p) => (
              <div className="kv" key={p.id}>
                <Feld wert={p.position} text breit={190} onSave={(v) => setzeAdmin(p.id, "position", v)} />
                <Feld wert={p.betrag} onSave={(v) => setzeAdmin(p.id, "betrag", v ?? 0)} />
                <button className="link-btn" onClick={() => adminWeg(p.id)}>×</button>
              </div>
            ))}
            <div className="kv"><div className="kv-key"><b>Zwischensumme</b></div>
              <div className="kv-val"><b>{chf(zwischen)}</b></div></div>
            {satz("Reserve", "admin_reserve", true)}
            <div className="kv"><div className="kv-key"><b>Total (Umlage nach Aboanteil)</b></div>
              <div className="kv-val"><b>{chf(t.admin)}</b></div></div>
            <button className="btn" onClick={adminHinzu}>Position hinzufügen</button>
          </div>
        </div>
      </div></>
    );
  }

  /* ---------- Ergebnis ---------- */
  const zeile = (k, v, klasse) => (
    <div className={`kv ${klasse || ""}`} key={k}>
      <div className="kv-key">{k}</div>
      <div className={`kv-val ${vorzeichen(v)}`}>{chf(v)}</div>
    </div>
  );
  const kunden = new Set(objektMonat.map((o) => (objektById.get(o.objekt_id)?.kunde || "").trim()).filter(Boolean)).size;

  return (
    <>{kopf}<div className="main-content">{kpis}
      <div className="kalk-grid">
        <div className="sheet">
          <div className="page-title">Ergebnis Gesamtbetrieb</div>
          {zeile("Abos (Umsatz)", t.abos)}
          {zeile("Objektlöhne inkl. Sozialabgaben", -t.lohnSzObj)}
          {zeile("Personallöhne inkl. Sozialabgaben", -t.lohnSzPers)}
          {zeile("Material", -t.mat)}
          {zeile("Maschinen", -t.mas)}
          {zeile("Transport / Treibstoff", -t.trs)}
          {zeile("Administration", -t.admin)}
          {zeile("Ergebnis", r.ergebnis, "total")}
          <div className="kv"><div className="kv-key">Marge</div>
            <div className={`kv-val ${vorzeichen(r.marge)}`}>{pct(r.marge)}</div></div>
        </div>

        <div className="sheet">
          <div className="page-title">Überleitung Deckungsbeitrag zu Ergebnis</div>
          {zeile("Deckungsbeitrag Objekte mit Stunden", t.gew)}
          {zeile("plus Beitrag Objekte ohne Stundenerfassung", r.beitragOhneStd)}
          {zeile("minus Personallöhne inkl. Sozialabgaben", -t.lohnSzPers)}
          {zeile("Ergebnis Gesamtbetrieb", r.ergebnis, "total")}
          {zeile("Kontrolle (muss 0 sein)", (t.gew + r.beitragOhneStd - t.lohnSzPers) - r.ergebnis)}
        </div>

        <div className="sheet">
          <div className="page-title">Struktur</div>
          <div className="kv"><div className="kv-key">Kunden</div><div className="kv-val">{kunden}</div></div>
          <div className="kv"><div className="kv-key">Objekte</div><div className="kv-val">{objektMonat.length}</div></div>
          <div className="kv"><div className="kv-key">davon aus Stundenerfassung</div><div className="kv-val">{t.ausErfassung}</div></div>
          <div className="kv"><div className="kv-key">davon ohne Stunden</div><div className="kv-val">{r.ohneStd}</div></div>
          <div className="kv"><div className="kv-key">Abos ohne Gewinnrechnung</div><div className="kv-val">{chf(r.abosOhneGew)}</div></div>
          <div className="kv"><div className="kv-key">Festpersonal</div><div className="kv-val">{personMonat.length}</div></div>
          <div className="kv"><div className="kv-key">Stunden im Monat</div><div className="kv-val">{chf(t.stdTotal)}</div></div>
          <div className="kv"><div className="kv-key">Ø Ertrag pro Stunde</div>
            <div className="kv-val">{t.stdTotal ? chf(t.abos / t.stdTotal) : "–"}</div></div>
        </div>
      </div>

      <div className="sheet" style={{ marginTop: 24 }}>
        <div className="page-title">Monatsvergleich</div>
        <table className="overview-table">
          <thead><tr>
            <th>Monat</th><th>Abos</th><th>Objekte</th><th>Stunden</th><th>Löhne + SZ</th>
            <th>Deckungsbeitrag</th><th>Gew %</th><th>Administration</th><th>Ergebnis</th><th>Marge</th>
          </tr></thead>
          <tbody>
            {alleMonate.map((m) => {
              // Fuer den offenen Monat den lokalen Stand nehmen, damit eine
              // Aenderung sofort in der Vergleichszeile steht.
              const q = m.s.monat === monat ? { s, objektMonat, personMonat, adminkosten } : m;
              const cc = rechne({ monat: m.s.monat, s: q.s, objektMonat: q.objektMonat,
                personMonat: q.personMonat, adminkosten: q.adminkosten, entries, employees });
              return (
                <tr key={m.s.monat} className={m.s.monat === monat ? "row-aktuell" : ""}>
                  <td className="cell-name">{monatName(m.s.monat)}</td>
                  <td className="cell-num">{chf0(cc.t.abos)}</td>
                  <td className="cell-num">{q.objektMonat.length}</td>
                  <td className="cell-num">{chf0(cc.t.stdTotal)}</td>
                  <td className="cell-num">{chf0(cc.t.lohnSzAlle)}</td>
                  <td className={`cell-num ${vorzeichen(cc.t.gew)}`}>{chf0(cc.t.gew)}</td>
                  <td className="cell-num cell-muted">{pct(cc.res.gewProzent)}</td>
                  <td className="cell-num">{chf0(cc.t.admin)}</td>
                  <td className={`cell-num ${vorzeichen(cc.res.ergebnis)}`}><b>{chf0(cc.res.ergebnis)}</b></td>
                  <td className="cell-num cell-muted">{pct(cc.res.marge)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div></>
  );
}
