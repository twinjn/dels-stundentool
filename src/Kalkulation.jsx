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
      className="matrix-cell-input"
      style={{ width: breit || 90, textAlign: text ? "left" : "right" }}
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

  /* Alle Monate fuer den Vergleich */
  useEffect(() => {
    if (!monate.length) return;
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
  }, [monate, objektMonat, personMonat, adminkosten]);

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
    const d = letzter ? new Date(letzter) : new Date();
    d.setMonth(d.getMonth() + 1);
    const neu = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
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
      <div className="page-title">Kalkulation · {monatName(monat)}</div>
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
    const zeilen = [...c.obj].sort((a, b) =>
      (objektById.get(a.o.objekt_id)?.name || "").localeCompare(objektById.get(b.o.objekt_id)?.name || ""));
    return (
      <>{kopf}<div className="main-content">{kpis}
        <div className="sheet sheet-wide">
          <table className="overview-table">
            <thead><tr>
              <th>Nr.</th><th>Objekt</th><th>Kunde</th>
              <th>Abo</th><th>Std.</th><th>Ansatz</th><th>MA</th>
              <th>Löhne</th><th>+ SZ</th><th>ZT</th>
              <th>Mat</th><th>Mas</th><th>Trs</th><th>Admin</th><th>Gewinn</th><th>%</th><th>aktiv</th>
            </tr></thead>
            <tbody>
              {zeilen.map((x) => {
                const o = objektById.get(x.o.objekt_id) || {};
                const rel = z(Number(x.o.abo_betrag)) ? x.gew / Number(x.o.abo_betrag) : 0;
                return (
                  <tr key={x.o.objekt_id} className={!x.o.aktiv ? "cell-muted" : x.gew < -0.005 ? "del-row" : ""}>
                    <td className="cell-muted">{o.objekt_nr || "–"}</td>
                    <td className="cell-name">{o.name}</td>
                    <td className="cell-muted">{o.kunde}</td>
                    <td className="cell-num"><Feld wert={x.o.abo_betrag} onSave={(v) => setzeObjekt(x.o.objekt_id, "abo_betrag", v)} /></td>
                    <td className="cell-num">
                      {x.ausErfassung
                        ? <span title={`aus ${x.personen} erfassten Mitarbeitenden`}><b>{chf(x.std)}</b> ⏱</span>
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
                    <td className="cell-num cell-muted">{chf(x.mat)}</td>
                    <td className="cell-num cell-muted">{chf(x.mas)}</td>
                    <td className="cell-num cell-muted">{chf(x.trs)}</td>
                    <td className="cell-num cell-muted">{chf(x.admin)}</td>
                    <td className={`cell-num ${vorzeichen(x.gew)}`}><b>{chf(x.gew)}</b></td>
                    <td className="cell-num cell-muted">{pct(rel)}</td>
                    <td className="cell-num">
                      <input type="checkbox" checked={!!x.o.aktiv}
                        onChange={(e) => setzeObjekt(x.o.objekt_id, "aktiv", e.target.checked)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="matrix-foot-row">
              <td></td><td>Total</td><td></td>
              <td className="cell-num">{chf(t.abos)}</td>
              <td className="cell-num">{chf(t.stdTotal)}</td><td></td>
              <td className="cell-num">{chf0(t.maTotal)}</td>
              <td className="cell-num">{chf(t.loehne)}</td>
              <td className="cell-num">{chf(t.lohnSzAlle)}</td>
              <td className={`cell-num ${vorzeichen(t.zt)}`}>{chf(t.zt)}</td>
              <td className="cell-num">{chf(t.mat)}</td>
              <td className="cell-num">{chf(t.mas)}</td>
              <td className="cell-num">{chf(t.trs)}</td>
              <td className="cell-num">{chf(t.admin)}</td>
              <td className={`cell-num ${vorzeichen(t.gew)}`}>{chf(t.gew)}</td>
              <td className="cell-num">{pct(r.gewProzent)}</td><td></td>
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
        </div>
      </div></>
    );
  }

  /* ---------- Personal ---------- */
  if (tab === "personal") {
    const offen = employees.filter((e) => !personMonat.some((p) => p.employee_id === e.id));
    return (
      <>{kopf}<div className="main-content">{kpis}
        <div className="sheet sheet-wide">
          <table className="overview-table">
            <thead><tr>
              <th>Name</th><th>Lohn</th><th>Spesen</th><th>13. ML</th>
              <th>AHV</th><th>ALV</th><th>RPK</th><th>FAK</th><th>FAK CHF</th>
              <th>BVG</th><th>BVG CHF</th><th>BU</th><th>KTG</th><th>Löhne + SZ</th><th></th>
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
                    <td className="cell-name">{e.name || "–"}</td>
                    <td className="cell-num"><Feld wert={x.p.lohn} onSave={(v) => setzePerson(x.p.employee_id, "lohn", v ?? 0)} /></td>
                    <td className="cell-num"><Feld wert={x.p.spesen} onSave={(v) => setzePerson(x.p.employee_id, "spesen", v ?? 0)} /></td>
                    <td className="cell-num">{cb("ml13")}</td>
                    <td className="cell-num">{cb("abzug_ahv")}</td>
                    <td className="cell-num">{cb("abzug_alv")}</td>
                    <td className="cell-num">{cb("abzug_rpk")}</td>
                    <td className="cell-num">{cb("abzug_fak")}</td>
                    <td className="cell-num">
                      <Feld wert={x.p.fak_manuell} onSave={(v) => setzePerson(x.p.employee_id, "fak_manuell", v)} />
                      <div className="cell-muted" style={{ fontSize: 11 }}>
                        {x.p.fak_manuell == null ? chf(x.fak) : "überschrieben"}</div>
                    </td>
                    <td className="cell-num">{cb("bvg")}</td>
                    <td className="cell-num">
                      <Feld wert={x.p.bvg_manuell} onSave={(v) => setzePerson(x.p.employee_id, "bvg_manuell", v)} />
                      <div className="cell-muted" style={{ fontSize: 11 }}>
                        {x.p.bvg_manuell == null ? chf(x.bvg) : "überschrieben"}</div>
                    </td>
                    <td className="cell-num cell-muted">{chf(x.bu)}</td>
                    <td className="cell-num cell-muted">{chf(x.ktg)}</td>
                    <td className="cell-num"><b>{chf(x.lohnSz)}</b></td>
                    <td><button className="link-btn" onClick={() => personWeg(x.p.employee_id)}>×</button></td>
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
              <td className="cell-num">{chf(t.lohnSzPers)}</td><td></td>
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
    const satz = (label, feld, prozent) => (
      <div className="edit-row" key={feld}>
        <div className="field">{label}</div>
        <Feld wert={prozent ? Number((s[feld] * 100).toFixed(6)) : s[feld]}
              onSave={(v) => setzeAnsatz(feld, prozent ? (v ?? 0) / 100 : v)} />
        <div className="cell-muted" style={{ width: 34 }}>{prozent ? "%" : "CHF"}</div>
      </div>
    );
    return (
      <>{kopf}<div className="main-content">
        <div className="home-cards">
          <div className="sheet">
            <div className="page-title">Sozialabzüge</div>
            {satz("AHV", "ahv", true)}{satz("ALV", "alv", true)}
            {satz("NBU", "nbu", true)}{satz("BU", "bu", true)}
            {satz("KTG Objekte", "ktg_objekt", true)}{satz("KTG Personal", "ktg_personal", true)}
            {satz("RPK", "rpk", true)}{satz("FAK Arbeitgeber", "fak", true)}
            {satz("13. Monatslohn", "ml13", true)}
            {satz("NBU-Schwelle (Std./Woche)", "nbu_schwelle", false)}
            <div className="edit-row">
              <div className="field">NBU trägt der Arbeitgeber</div>
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
            <div className="edit-row">
              <div className="field">Treibstoff verteilen</div>
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
              <div className="edit-row" key={p.id}>
                <Feld wert={p.position} text breit={190} onSave={(v) => setzeAdmin(p.id, "position", v)} />
                <Feld wert={p.betrag} onSave={(v) => setzeAdmin(p.id, "betrag", v ?? 0)} />
                <button className="link-btn" onClick={() => adminWeg(p.id)}>×</button>
              </div>
            ))}
            <div className="edit-row"><div className="field"><b>Zwischensumme</b></div>
              <div className="cell-num"><b>{chf(zwischen)}</b></div></div>
            {satz("Reserve", "admin_reserve", true)}
            <div className="edit-row"><div className="field"><b>Total (Umlage nach Aboanteil)</b></div>
              <div className="cell-num"><b>{chf(t.admin)}</b></div></div>
            <button className="btn" onClick={adminHinzu}>Position hinzufügen</button>
          </div>
        </div>
      </div></>
    );
  }

  /* ---------- Ergebnis ---------- */
  const zeile = (k, v, klasse) => (
    <div className={`edit-row ${klasse || ""}`} key={k}>
      <div className="field">{k}</div>
      <div className={`cell-num ${vorzeichen(v)}`}>{chf(v)}</div>
    </div>
  );
  const kunden = new Set(objektMonat.map((o) => (objektById.get(o.objekt_id)?.kunde || "").trim()).filter(Boolean)).size;

  return (
    <>{kopf}<div className="main-content">{kpis}
      <div className="home-cards">
        <div className="sheet">
          <div className="page-title">Ergebnis Gesamtbetrieb</div>
          {zeile("Abos (Umsatz)", t.abos)}
          {zeile("Objektlöhne inkl. Sozialabgaben", -t.lohnSzObj)}
          {zeile("Personallöhne inkl. Sozialabgaben", -t.lohnSzPers)}
          {zeile("Material", -t.mat)}
          {zeile("Maschinen", -t.mas)}
          {zeile("Transport / Treibstoff", -t.trs)}
          {zeile("Administration", -t.admin)}
          {zeile("Ergebnis", r.ergebnis, "matrix-foot-row")}
          <div className="edit-row"><div className="field">Marge</div>
            <div className={`cell-num ${vorzeichen(r.marge)}`}>{pct(r.marge)}</div></div>
        </div>

        <div className="sheet">
          <div className="page-title">Überleitung Deckungsbeitrag zu Ergebnis</div>
          {zeile("Deckungsbeitrag Objekte mit Stunden", t.gew)}
          {zeile("plus Beitrag Objekte ohne Stundenerfassung", r.beitragOhneStd)}
          {zeile("minus Personallöhne inkl. Sozialabgaben", -t.lohnSzPers)}
          {zeile("Ergebnis Gesamtbetrieb", r.ergebnis, "matrix-foot-row")}
          {zeile("Kontrolle (muss 0 sein)", (t.gew + r.beitragOhneStd - t.lohnSzPers) - r.ergebnis)}
        </div>

        <div className="sheet">
          <div className="page-title">Struktur</div>
          <div className="edit-row"><div className="field">Kunden</div><div className="cell-num">{kunden}</div></div>
          <div className="edit-row"><div className="field">Objekte</div><div className="cell-num">{objektMonat.length}</div></div>
          <div className="edit-row"><div className="field">davon aus Stundenerfassung</div><div className="cell-num">{t.ausErfassung}</div></div>
          <div className="edit-row"><div className="field">davon ohne Stunden</div><div className="cell-num">{r.ohneStd}</div></div>
          <div className="edit-row"><div className="field">Abos ohne Gewinnrechnung</div><div className="cell-num">{chf(r.abosOhneGew)}</div></div>
          <div className="edit-row"><div className="field">Festpersonal</div><div className="cell-num">{personMonat.length}</div></div>
          <div className="edit-row"><div className="field">Stunden im Monat</div><div className="cell-num">{chf(t.stdTotal)}</div></div>
          <div className="edit-row"><div className="field">Ø Ertrag pro Stunde</div>
            <div className="cell-num">{t.stdTotal ? chf(t.abos / t.stdTotal) : "–"}</div></div>
        </div>
      </div>

      <div className="sheet sheet-wide" style={{ marginTop: 16 }}>
        <div className="page-title">Monatsvergleich</div>
        <table className="overview-table">
          <thead><tr>
            <th>Monat</th><th>Abos</th><th>Objekte</th><th>Stunden</th><th>Löhne + SZ</th>
            <th>Deckungsbeitrag</th><th>Gew %</th><th>Administration</th><th>Ergebnis</th><th>Marge</th>
          </tr></thead>
          <tbody>
            {alleMonate.map((m, i) => {
              const cc = rechne({ monat: m.s.monat, s: m.s, objektMonat: m.objektMonat,
                personMonat: m.personMonat, adminkosten: m.adminkosten, entries, employees });
              return (
                <tr key={m.s.monat} className={m.s.monat === monat ? "matrix-foot-row" : ""}>
                  <td className="cell-name">{monatName(m.s.monat)}</td>
                  <td className="cell-num">{chf0(cc.t.abos)}</td>
                  <td className="cell-num">{m.objektMonat.length}</td>
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
