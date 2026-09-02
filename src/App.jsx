import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "./supabaseClient.js";
import delsLogo from "./assets/dels-logo.png";

const TYPES = {
  arbeit: { label: "Gearbeitet", unit: "Std.", cls: "type-arbeit" },
  ferien: { label: "Ferien", unit: "Tage", cls: "type-ferien" },
  krankheit: { label: "Krankheit", unit: "Tage", cls: "type-krankheit" },
  unfall: { label: "Unfall", unit: "Tage", cls: "type-unfall" },
  feiertag: { label: "Feiertag", unit: "Tage", cls: "type-feiertag" },
  sonstiges: { label: "Sonstiges", unit: "Tage", cls: "type-sonstiges" },
  spesen: { label: "Spesen", unit: "CHF", cls: "type-spesen" },
};
const MONTH_NAMES = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const ABSENCE_SHORT = { ferien: "F", krankheit: "K", unfall: "U", feiertag: "FT", sonstiges: "S" };

function monthDayNumbers(year, month) {
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => i + 1);
}

const MITARBEITERSTUFEN = [
  "Unterhaltsreinigung I",
  "Unterhaltsreinigung II",
  "Spezialreinigung I",
  "Spezialreinigung II",
  "Spitalreinigung I",
  "Spitalreinigung II",
  "Fahrzeugreinigung I",
  "Fahrzeugreinigung II",
  "Objektleiter/in / Vorarbeiter/in",
  "Reinigungsfachkraft EBA",
  "Reinigungsfachkraft EFZ",
  "Monatslohn",
];

const STAMMDATEN_COLUMNS = [
  { key: "personalnummer", label: "Personal-Nr.", type: "text", width: 110 },
  { key: "geburtsdatum", label: "Geburtsdatum", type: "date", width: 140 },
  { key: "eintrittsdatum", label: "Eintritt", type: "date", width: 140 },
  { key: "telefon", label: "Telefon", type: "text", width: 130 },
  { key: "email", label: "E-Mail", type: "email", width: 180 },
  { key: "strasse", label: "Strasse", type: "text", width: 170 },
  { key: "plz", label: "PLZ", type: "text", width: 70 },
  { key: "ort", label: "Ort", type: "text", width: 130 },
  { key: "ahv_nummer", label: "AHV-Nr.", type: "text", width: 150 },
  { key: "iban", label: "IBAN", type: "text", width: 200 },
];

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
}
function fmtHours(n) {
  return (Math.round(Number(n) * 100) / 100).toString().replace(".", ",");
}

// ---------- Legende für die Matrix-Farben und Kürzel ----------
function MatrixLegend({ showArbeit = true }) {
  return (
    <div className="matrix-legend">
      {showArbeit && <span className="legend-chip matrix-cell has-arbeit">8</span>}
      {showArbeit && <span className="legend-label">Stunden gearbeitet</span>}
      <span className="legend-chip matrix-cell type-ferien">F</span>
      <span className="legend-label">Ferien</span>
      <span className="legend-chip matrix-cell type-krankheit">K</span>
      <span className="legend-label">Krankheit</span>
      <span className="legend-chip matrix-cell type-unfall">U</span>
      <span className="legend-label">Unfall</span>
      <span className="legend-chip matrix-cell type-feiertag">FT</span>
      <span className="legend-label">Feiertag</span>
      <span className="legend-chip matrix-cell type-sonstiges">S</span>
      <span className="legend-label">Sonstiges</span>
      <span className="legend-chip legend-chip-monatslohn"></span>
      <span className="legend-label">Monatslohn</span>
    </div>
  );
}

// ---------- Employee row for the day-matrix table (shared by Erfassung + Monatsübersicht) ----------
function EmployeeMatrixRow({ e, days, year, month, monthEntries, totals, objekteById, isExpanded, onToggleExpand, onSpesenChange }) {
  const isMonatslohn = e.mitarbeiterstufe === "Monatslohn";
  const spesenEntries = monthEntries.filter((en) => en.type === "spesen");
  const byObjekt = {};
  monthEntries.filter((en) => en.type === "arbeit").forEach((en) => {
    const k = en.objekt_id || "none";
    (byObjekt[k] = byObjekt[k] || []).push(en);
  });
  const objektKeys = Object.keys(byObjekt);

  return (
    <React.Fragment>
      <tr className={isMonatslohn ? "matrix-row-monatslohn" : ""}>
        <td className="matrix-name-col" title={isMonatslohn ? "Monatslohn" : undefined}>
          <div className="matrix-name-inner">
            {objektKeys.length > 0 && (
              <button className="matrix-expand-btn" title="Objekt-Details anzeigen" onClick={onToggleExpand}>
                {isExpanded ? "−" : "+"}
              </button>
            )}
            <span title={e.name}>{e.name}</span>
          </div>
        </td>
        {days.map((d) => {
          const dateISO = `${year}-${pad(month + 1)}-${pad(d)}`;
          const dayEntries = monthEntries.filter((en) => en.date === dateISO);
          const arbeitSum = dayEntries.filter((en) => en.type === "arbeit").reduce((s, en) => s + Number(en.value), 0);
          const otherEntry = dayEntries.find((en) => en.type !== "arbeit" && en.type !== "spesen");
          const wd = new Date(year, month, d).getDay();
          return (
            <td
              key={d}
              className={`matrix-cell ${wd === 0 || wd === 6 ? "weekend" : ""} ${dateISO === todayISO() ? "is-today" : ""} ${arbeitSum ? "has-arbeit" : ""} ${otherEntry ? TYPES[otherEntry.type].cls : ""}`}
            >
              {arbeitSum ? fmtHours(arbeitSum) : otherEntry ? ABSENCE_SHORT[otherEntry.type] : ""}
            </td>
          );
        })}
        <td className="matrix-total-col">{fmtHours(totals.arbeit)}</td>
        <td className="matrix-total-col">{fmtHours(totals.ferien)}</td>
        <td className="matrix-total-col">{fmtHours(totals.krankheit)}</td>
        <td className="matrix-total-col">{fmtHours(totals.unfall)}</td>
        <td className="matrix-total-col">{fmtHours(totals.sonstiges + totals.feiertag)}</td>
        <td className="matrix-total-col matrix-spesen-col">
          {onSpesenChange && spesenEntries.length <= 1 ? (
            <input
              type="number" min="0" step="0.05" className="matrix-cell-input"
              defaultValue={totals.spesen || ""}
              key={"spesen-" + e.id + "-" + totals.spesen}
              placeholder="0"
              onBlur={(ev) => onSpesenChange(e.id, spesenEntries[0] || null, ev.target.value)}
            />
          ) : (
            fmtHours(totals.spesen)
          )}
        </td>
      </tr>
      {isExpanded && objektKeys.map((k) => {
        const objEntries = byObjekt[k];
        const obj = k !== "none" ? objekteById[k] : null;
        const objTotal = objEntries.reduce((s, en) => s + Number(en.value), 0);
        return (
          <tr key={"obj-" + k} className="matrix-sub-row">
            <td className="matrix-name-col matrix-sub-name">↳ {obj ? obj.name : "Ohne Objekt"}</td>
            {days.map((d) => {
              const dateISO = `${year}-${pad(month + 1)}-${pad(d)}`;
              const val = objEntries.filter((en) => en.date === dateISO).reduce((s, en) => s + Number(en.value), 0);
              const wd = new Date(year, month, d).getDay();
              return <td key={d} className={`matrix-cell matrix-sub-cell ${wd === 0 || wd === 6 ? "weekend" : ""}`}>{val ? fmtHours(val) : ""}</td>;
            })}
            <td className="matrix-total-col">{fmtHours(objTotal)}</td>
            <td className="matrix-total-col"></td>
            <td className="matrix-total-col"></td>
            <td className="matrix-total-col"></td>
            <td className="matrix-total-col"></td>
            <td className="matrix-total-col"></td>
          </tr>
        );
      })}
    </React.Fragment>
  );
}

// ---------- Employee row for the Objekt-matrix table (Mitarbeiter x Tage, reine Anzeige) ----------
function ObjektMatrixRow({ emp, days, year, month, entriesByDate, absencesByDate }) {
  let total = 0;
  Object.values(entriesByDate).forEach((en) => { total += Number(en.value); });
  const isMonatslohn = emp.mitarbeiterstufe === "Monatslohn";
  return (
    <tr className={isMonatslohn ? "matrix-row-monatslohn" : ""}>
      <td className="matrix-name-col" title={isMonatslohn ? "Monatslohn" : undefined}><span title={emp.name}>{emp.name}</span></td>
      {days.map((d) => {
        const dateISO = `${year}-${pad(month + 1)}-${pad(d)}`;
        const entry = entriesByDate[dateISO];
        const absence = absencesByDate && absencesByDate[dateISO];
        const wd = new Date(year, month, d).getDay();
        return (
          <td
            key={d}
            className={`matrix-cell ${wd === 0 || wd === 6 ? "weekend" : ""} ${dateISO === todayISO() ? "is-today" : ""} ${entry ? "has-arbeit" : ""} ${!entry && absence ? TYPES[absence.type].cls : ""}`}
            title={!entry && absence ? TYPES[absence.type].label : undefined}
          >
            {entry ? fmtHours(entry.value) : absence ? ABSENCE_SHORT[absence.type] : ""}
          </td>
        );
      })}
      <td className="matrix-total-col">{fmtHours(total)}</td>
    </tr>
  );
}

// ---------- Toast ----------
function useToast() {
  const [msg, setMsg] = useState(null);
  const show = useCallback((text) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 2000);
  }, []);
  return [msg, show];
}

// ---------- Login ----------
function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Login fehlgeschlagen. E-Mail oder Passwort prüfen.");
      return;
    }
    onLoggedIn();
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={delsLogo} alt="DELS Reinigung & Beratung" className="login-logo" />
        <div className="sub">Bitte einloggen, um fortzufahren.</div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>E-Mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Passwort</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="btn full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? "Wird geprüft …" : "Einloggen"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- Dashboard (Startseite, Vollbild) ----------
function Dashboard({ employees, objekte, monthTotals, yearFerienUsed, onEnterStundentool, onEnterObjekte, onLogout, email }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const y = now.getFullYear(), m = now.getMonth();
  const totalArbeitThisMonth = employees.reduce((s, e) => s + monthTotals(e.id, y, m).arbeit, 0);
  const ferienWarnings = employees.filter((e) => (e.ferienanspruch - yearFerienUsed(e.id, y)) < 0);
  const dateLabel = now.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="dashboard-screen">
      <div className="dashboard-topbar">
        <span className="who">{email}</span>
        <button className="link-btn" onClick={onLogout}>Abmelden</button>
      </div>
      <div className="dashboard-center">
        <img src={delsLogo} alt="DELS Reinigung & Beratung" className="dashboard-logo-big" />
        <div className="dashboard-greeting">Willkommen zurück</div>
        <div className="dashboard-date">{dateLabel}</div>

        <div className="stats dashboard-stats">
          <div className="stat"><div className="n">{employees.length}</div><div className="l">Mitarbeiter</div></div>
          <div className="stat"><div className="n">{objekte.length}</div><div className="l">Objekte</div></div>
          <div className="stat"><div className="n">{fmtHours(totalArbeitThisMonth)}</div><div className="l">Std. diesen Monat</div></div>
          <div className={`stat ${ferienWarnings.length ? "warn" : ""}`}><div className="n">{ferienWarnings.length}</div><div className="l">Ferien-Warnungen</div></div>
        </div>

        {ferienWarnings.length > 0 && (
          <div className="card dashboard-warning-card">
            <div className="dashboard-warning-title">Negativer Ferien-Saldo {y}</div>
            <ul className="dashboard-warning-list">
              {ferienWarnings.map((e) => (
                <li key={e.id}>{e.name}: {fmtHours(e.ferienanspruch - yearFerienUsed(e.id, y))} Tage</li>
              ))}
            </ul>
          </div>
        )}

        <div className="home-cards">
          <div className="home-card" onClick={onEnterStundentool}>
            <div className="home-card-title">Stundentool</div>
            <div className="home-card-sub">Arbeitszeit, Ferien und Absenzen pro Mitarbeiter erfassen</div>
          </div>
          <div className="home-card" onClick={onEnterObjekte}>
            <div className="home-card-title">Objekte</div>
            <div className="home-card-sub">Reinigungsobjekte verwalten und Stunden pro Standort erfassen</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Confirm modal ----------
function ConfirmModal({ text, onCancel, onConfirm }) {
  return (
    <div className="modal-bg">
      <div className="modal">
        <h3>{text}</h3>
        <div className="modal-actions">
          <button className="btn ghost full" onClick={onCancel}>Abbrechen</button>
          <button className="btn danger full" onClick={onConfirm}>Löschen</button>
        </div>
      </div>
    </div>
  );
}

// ---------- New objekt modal ----------
function NewObjektModal({ onCancel, onCreate }) {
  const [name, setName] = useState("");
  const [strasse, setStrasse] = useState("");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");
  const [kunde, setKunde] = useState("");

  return (
    <div className="modal-bg">
      <div className="modal">
        <h3>Neues Objekt</h3>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Liegenschaft Bahnhofstrasse" autoFocus />
        </div>
        <div className="row2">
          <div className="field"><label>Strasse</label><input type="text" value={strasse} onChange={(e) => setStrasse(e.target.value)} /></div>
          <div className="field"><label>Kunde/Ansprechperson</label><input type="text" value={kunde} onChange={(e) => setKunde(e.target.value)} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>PLZ</label><input type="text" value={plz} onChange={(e) => setPlz(e.target.value)} /></div>
          <div className="field"><label>Ort</label><input type="text" value={ort} onChange={(e) => setOrt(e.target.value)} /></div>
        </div>
        <div className="modal-actions">
          <button className="btn ghost full" onClick={onCancel}>Abbrechen</button>
          <button
            className="btn full"
            onClick={() => {
              if (!name.trim()) return;
              onCreate({
                name: name.trim(),
                strasse: strasse.trim() || null,
                plz: plz.trim() || null,
                ort: ort.trim() || null,
                kunde: kunde.trim() || null,
              });
            }}
          >
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Employee master data table ----------
const EMPTY_NEW_EMPLOYEE = {
  name: "", mitarbeiterstufe: "", personalnummer: "", geburtsdatum: "", eintrittsdatum: "",
  telefon: "", email: "", strasse: "", plz: "", ort: "", ahv_nummer: "", iban: "",
  ferienanspruch: 25, soll_pro_tag: 8.4,
};

function EmployeeMasterTable({ employees, onUpdateField, onCreate, onDelete }) {
  const [newRow, setNewRow] = useState(EMPTY_NEW_EMPLOYEE);
  function setField(k, v) { setNewRow((prev) => ({ ...prev, [k]: v })); }

  function submit() {
    if (!newRow.name.trim()) return;
    const payload = { name: newRow.name.trim() };
    payload.mitarbeiterstufe = newRow.mitarbeiterstufe || null;
    STAMMDATEN_COLUMNS.forEach((c) => { payload[c.key] = String(newRow[c.key] || "").trim() || null; });
    payload.ferienanspruch = parseFloat(newRow.ferienanspruch) || 0;
    payload.soll_pro_tag = parseFloat(newRow.soll_pro_tag) || 8.4;
    onCreate(payload);
    setNewRow(EMPTY_NEW_EMPLOYEE);
  }

  return (
    <div className="sheet sheet-wide">
      <table>
        <thead>
          <tr>
            <th style={{ width: 160 }}>Name</th>
            <th style={{ width: 170 }}>Stufe (GAV)</th>
            {STAMMDATEN_COLUMNS.map((c) => <th key={c.key} style={{ width: c.width }}>{c.label}</th>)}
            <th style={{ width: 110 }}>Ferien/Jahr</th>
            <th style={{ width: 110 }}>Soll-Std./Tag</th>
            <th style={{ width: 70 }}></th>
          </tr>
        </thead>
        <tbody>
          <tr className="entry-form-row">
            <td><input type="text" value={newRow.name} onChange={(e) => setField("name", e.target.value)} placeholder="Name" /></td>
            <td>
              <select value={newRow.mitarbeiterstufe} onChange={(e) => setField("mitarbeiterstufe", e.target.value)}>
                <option value="">– wählen –</option>
                {MITARBEITERSTUFEN.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </td>
            {STAMMDATEN_COLUMNS.map((c) => (
              <td key={c.key}>
                <input type={c.type} value={newRow[c.key]} onChange={(e) => setField(c.key, e.target.value)} />
              </td>
            ))}
            <td><input type="number" min="0" step="0.5" value={newRow.ferienanspruch} onChange={(e) => setField("ferienanspruch", e.target.value)} /></td>
            <td><input type="number" min="0" step="0.1" value={newRow.soll_pro_tag} onChange={(e) => setField("soll_pro_tag", e.target.value)} /></td>
            <td><button className="btn small full" onClick={submit}>+ Hinzufügen</button></td>
          </tr>
          {!employees.length && (
            <tr><td colSpan={STAMMDATEN_COLUMNS.length + 5} className="empty">Noch keine Mitarbeiter erfasst. Trage oben den ersten ein.</td></tr>
          )}
          {employees.map((emp) => (
            <tr key={emp.id}>
              <td style={{ fontWeight: 600 }}>{emp.name}</td>
              <td>
                <select
                  defaultValue={emp.mitarbeiterstufe || ""}
                  key={"stufe-" + emp.id}
                  onChange={(e) => onUpdateField(emp.id, "mitarbeiterstufe", e.target.value || null)}
                >
                  <option value="">–</option>
                  {MITARBEITERSTUFEN.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              {STAMMDATEN_COLUMNS.map((c) => (
                <td key={c.key}>
                  <input
                    type={c.type}
                    defaultValue={emp[c.key] || ""}
                    key={c.key + "-" + emp.id}
                    onBlur={(e) => onUpdateField(emp.id, c.key, e.target.value.trim() || null)}
                  />
                </td>
              ))}
              <td>
                <input
                  type="number" min="0" step="0.5" defaultValue={emp.ferienanspruch}
                  key={"fer-" + emp.id}
                  onBlur={(e) => onUpdateField(emp.id, "ferienanspruch", parseFloat(e.target.value) || 0)}
                />
              </td>
              <td>
                <input
                  type="number" min="0" step="0.1" defaultValue={emp.soll_pro_tag}
                  key={"soll-" + emp.id}
                  onBlur={(e) => onUpdateField(emp.id, "soll_pro_tag", parseFloat(e.target.value) || 8.4)}
                />
              </td>
              <td><button className="del-row" onClick={() => onDelete(emp.id)}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Sidebar ----------
function Sidebar({
  section, onSwitchSection,
  stTab, setStTab, onNewEmployee,
  objTab, setObjTab, objekte, selectedObjekt, onSelectObjekt, onNewObjekt, onDeleteObjekt,
  onExportPdf, onExportBackup, onLogout, email,
}) {
  const isSt = section === "stundentool";
  const isObj = section === "objekte";
  const [objSearch, setObjSearch] = useState("");
  const q = objSearch.trim().toLowerCase();
  const visibleObjekte = q
    ? objekte.filter((o) => [o.name, o.ort, o.kunde].some((f) => (f || "").toLowerCase().includes(q)))
    : objekte;
  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div className="brand">
          <img src={delsLogo} alt="DELS" className="brand-logo" />
          <div className="sub">Stunden &amp; Objekte</div>
        </div>
      </div>

      <div className="section-switch">
        <button className={`switch-btn ${section === "home" ? "active" : ""}`} onClick={() => onSwitchSection("home")}>Start</button>
        <button className={`switch-btn ${isSt ? "active" : ""}`} onClick={() => onSwitchSection("stundentool")}>Stundentool</button>
        <button className={`switch-btn ${isObj ? "active" : ""}`} onClick={() => onSwitchSection("objekte")}>Objekte</button>
      </div>

      {section !== "home" && (
        <div className="sidebar-nav">
          {isSt ? (
            <>
              <div className={`nav-item ${stTab === "uebersicht" ? "active" : ""}`} onClick={() => setStTab("uebersicht")}>Monatsübersicht</div>
              <div className={`nav-item ${stTab === "stammdaten" ? "active" : ""}`} onClick={() => setStTab("stammdaten")}>Mitarbeiterdaten</div>
            </>
          ) : (
            <>
              <div className={`nav-item ${objTab === "erfassung" ? "active" : ""}`} onClick={() => setObjTab("erfassung")}>Erfassung</div>
              <div className={`nav-item ${objTab === "uebersicht" ? "active" : ""}`} onClick={() => setObjTab("uebersicht")}>Monatsübersicht</div>
              <div className={`nav-item ${objTab === "absenzen" ? "active" : ""}`} onClick={() => setObjTab("absenzen")}>Absenzen</div>
            </>
          )}
        </div>
      )}

      {isSt && (
        <div className="sidebar-emp-section sidebar-home-spacer">
          <button className="btn ghost full sidebar-add-btn" onClick={onNewEmployee}>+ Mitarbeiter</button>
        </div>
      )}
      {isObj && objTab !== "absenzen" && (
        <div className="sidebar-emp-section">
          <div className="sidebar-emp-title">Objekte ({objekte.length})</div>
          {objekte.length > 8 && (
            <input
              className="sidebar-search"
              type="search"
              value={objSearch}
              onChange={(ev) => setObjSearch(ev.target.value)}
              placeholder="Objekt suchen…"
            />
          )}
          <div className="emp-list">
            {visibleObjekte.map((o) => (
              <div
                key={o.id}
                className={`emp-item ${objTab === "erfassung" && o.id === selectedObjekt ? "active" : ""}`}
                onClick={() => { onSelectObjekt(o.id); setObjTab("erfassung"); }}
                title={[o.name, o.ort].filter(Boolean).join(" · ")}
              >
                <span>{o.name}</span>
                <button className="del" title="Objekt löschen" onClick={(ev) => { ev.stopPropagation(); onDeleteObjekt(o.id); }}>✕</button>
              </div>
            ))}
            {!visibleObjekte.length && <div className="sidebar-noresult">Kein Objekt gefunden</div>}
          </div>
          <button className="btn ghost full sidebar-add-btn" onClick={onNewObjekt}>+ Objekt</button>
        </div>
      )}
      {(section === "home" || (isObj && objTab === "absenzen")) && <div className="sidebar-emp-section sidebar-home-spacer"></div>}

      <div className="sidebar-footer">
        <button className="btn secondary full" onClick={onExportPdf}>PDF exportieren</button>
        <button className="btn ghost full sidebar-backup-btn" onClick={onExportBackup} title="Alle Daten als JSON-Datei sichern">Backup erstellen</button>
        <div className="sidebar-user">
          <span className="who">{email}</span>
          <button className="link-btn" onClick={onLogout}>Abmelden</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main app (after login) ----------
function MainApp({ session }) {
  const [employees, setEmployees] = useState([]);
  const [objekte, setObjekte] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("home"); // home | stundentool | objekte
  const [stTab, setStTab] = useState("uebersicht");
  const [objTab, setObjTab] = useState("erfassung");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedObjekt, setSelectedObjekt] = useState(null);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind, id }
  const [editingEntry, setEditingEntry] = useState(null); // { id, date, type, objektId, employeeId, value, note }
  const [expandedEmployees, setExpandedEmployees] = useState(new Set());
  const [showNewObjekt, setShowNewObjekt] = useState(false);
  const [objektMetaOpen, setObjektMetaOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("dels_matrix_name_w");
    if (saved) document.documentElement.style.setProperty("--matrix-name-w", saved + "px");
  }, []);

  function startNameColResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--matrix-name-w")) || 120;
    let finalWidth = startWidth;
    function onMove(ev) {
      finalWidth = Math.min(280, Math.max(70, startWidth + (ev.clientX - startX)));
      document.documentElement.style.setProperty("--matrix-name-w", finalWidth + "px");
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      localStorage.setItem("dels_matrix_name_w", String(Math.round(finalWidth)));
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  const [toastMsg, showToast] = useToast();

  const [newDate, setNewDate] = useState(todayISO());
  const [newType, setNewType] = useState("ferien");
  const [newValue, setNewValue] = useState(1);
  const [newNote, setNewNote] = useState("");
  const [rangeMode, setRangeMode] = useState(false);
  const [newRangeEnd, setNewRangeEnd] = useState("");
  const [rangeWeekdays, setRangeWeekdays] = useState(new Set([1, 2, 3, 4, 5])); // 0=So..6=Sa, default Mo-Fr

  const [newObjDate, setNewObjDate] = useState(todayISO());
  const [newObjEmployeeId, setNewObjEmployeeId] = useState("");
  const [newObjValue, setNewObjValue] = useState(8.4);
  const [newObjNote, setNewObjNote] = useState("");
  const [objRangeMode, setObjRangeMode] = useState(false);
  const [newObjRangeEnd, setNewObjRangeEnd] = useState("");
  const [objRangeWeekdays, setObjRangeWeekdays] = useState(new Set([1, 2, 3, 4, 5]));
  const [lastBulkAdd, setLastBulkAdd] = useState(null); // { ids: [], count }

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: emps, error: empErr }, { data: ents, error: entErr }, { data: objs, error: objErr }] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("entries").select("*"),
      supabase.from("objekte").select("*").order("name"),
    ]);
    if (empErr || entErr || objErr) {
      showToast("Fehler beim Laden der Daten.");
    } else {
      setEmployees(emps || []);
      setEntries(ents || []);
      setObjekte(objs || []);
      if (!selectedEmployee && emps && emps.length) setSelectedEmployee(emps[0].id);
      if (!selectedObjekt && objs && objs.length) setSelectedObjekt(objs[0].id);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!lastBulkAdd) return;
    const t = setTimeout(() => setLastBulkAdd(null), 15000);
    return () => clearTimeout(t);
  }, [lastBulkAdd]);

  const emp = useMemo(() => employees.find((e) => e.id === selectedEmployee) || null, [employees, selectedEmployee]);
  const objekt = useMemo(() => objekte.find((o) => o.id === selectedObjekt) || null, [objekte, selectedObjekt]);
  const objekteById = useMemo(() => Object.fromEntries(objekte.map((o) => [o.id, o])), [objekte]);

  useEffect(() => {
    setNewValue(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newType, emp?.id]);

  useEffect(() => {
    const e = employees.find((x) => x.id === newObjEmployeeId);
    if (e) setNewObjValue(e.soll_pro_tag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newObjEmployeeId]);

  function entriesForMonth(employeeId, year, month) {
    return entries
      .filter((e) => e.employee_id === employeeId)
      .filter((e) => {
        const d = new Date(e.date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function entriesForObjektMonth(objektId, year, month) {
    return entries
      .filter((e) => e.objekt_id === objektId && e.type === "arbeit")
      .filter((e) => {
        const d = new Date(e.date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function monthTotals(employeeId, year, month) {
    const list = entriesForMonth(employeeId, year, month);
    const totals = { arbeit: 0, ferien: 0, krankheit: 0, unfall: 0, feiertag: 0, sonstiges: 0, spesen: 0 };
    list.forEach((e) => { totals[e.type] = (totals[e.type] || 0) + Number(e.value); });
    return totals;
  }

  function yearFerienUsed(employeeId, year) {
    return entries
      .filter((e) => e.employee_id === employeeId && e.type === "ferien")
      .filter((e) => new Date(e.date + "T00:00:00").getFullYear() === year)
      .reduce((s, e) => s + Number(e.value), 0);
  }

  function shiftMonth(delta) {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m); setViewYear(y);
  }

  async function createEmployee(payload) {
    const { data, error } = await supabase.from("employees").insert(payload).select().single();
    if (error) { showToast("Fehler beim Anlegen."); return; }
    setEmployees((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedEmployee(data.id);
    setShowNewEmployee(false);
    showToast("Mitarbeiter hinzugefügt");
  }

  async function updateEmployeeField(id, field, value) {
    const { error } = await supabase.from("employees").update({ [field]: value }).eq("id", id);
    if (error) { showToast("Fehler beim Speichern."); return; }
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
    showToast("Gespeichert");
  }

  async function deleteEmployee(id) {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { showToast("Fehler beim Löschen."); return; }
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setEntries((prev) => prev.filter((e) => e.employee_id !== id));
    if (selectedEmployee === id) {
      const rest = employees.filter((e) => e.id !== id);
      setSelectedEmployee(rest.length ? rest[0].id : null);
    }
    showToast("Mitarbeiter gelöscht");
  }

  async function createObjekt(payload) {
    const { data, error } = await supabase.from("objekte").insert(payload).select().single();
    if (error) { showToast("Fehler beim Anlegen."); return; }
    setObjekte((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedObjekt(data.id);
    setShowNewObjekt(false);
    showToast("Objekt hinzugefügt");
  }

  async function updateObjektField(id, field, value) {
    const { error } = await supabase.from("objekte").update({ [field]: value }).eq("id", id);
    if (error) { showToast("Fehler beim Speichern."); return; }
    setObjekte((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
    showToast("Gespeichert");
  }

  async function deleteObjekt(id) {
    const { error } = await supabase.from("objekte").delete().eq("id", id);
    if (error) {
      showToast("Objekt kann nicht gelöscht werden – es sind noch Stunden darauf gebucht.");
      return;
    }
    setObjekte((prev) => prev.filter((o) => o.id !== id));
    if (selectedObjekt === id) {
      const rest = objekte.filter((o) => o.id !== id);
      setSelectedObjekt(rest.length ? rest[0].id : null);
    }
    showToast("Objekt gelöscht");
  }

  async function addEntry({ employeeId, date, type, value, note, objektId, silent }) {
    if (!employeeId) { if (!silent) showToast("Bitte einen Mitarbeiter wählen"); return false; }
    if (!date) { if (!silent) showToast("Bitte ein Datum wählen"); return false; }
    const val = parseFloat(value);
    if (isNaN(val) || val < 0) { if (!silent) showToast("Bitte einen gültigen Wert eingeben"); return false; }
    if (type === "arbeit" && !objektId) { if (!silent) showToast("Bitte ein Objekt wählen"); return false; }
    const payload = {
      employee_id: employeeId,
      date,
      type,
      value: val,
      note: (note || "").trim() || null,
      objekt_id: type === "arbeit" ? objektId : null,
    };
    const { data, error } = await supabase.from("entries").insert(payload).select().single();
    if (error) { if (!silent) showToast("Fehler beim Speichern."); return false; }
    setEntries((prev) => [...prev, data]);
    if (!silent) showToast("Eintrag gespeichert");
    return data;
  }

  function toggleRangeWeekday(idx) {
    setRangeWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function handleAddStEntry() {
    if (rangeMode && newRangeEnd && newRangeEnd >= newDate) {
      const start = new Date(newDate + "T00:00:00");
      const end = new Date(newRangeEnd + "T00:00:00");
      let skipped = 0;
      const createdIds = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const wd = d.getDay();
        if (!rangeWeekdays.has(wd)) continue;
        const dateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const already = entries.some((en) => en.employee_id === selectedEmployee && en.date === dateISO && en.type === newType);
        if (already) { skipped++; continue; }
        const created = await addEntry({ employeeId: selectedEmployee, date: dateISO, type: newType, value: newValue, note: newNote, silent: true });
        if (created) createdIds.push(created.id);
      }
      showToast(createdIds.length ? `${createdIds.length} Einträge gespeichert${skipped ? `, ${skipped} übersprungen (schon vorhanden)` : ""}` : "Keine neuen Einträge – alle Tage bereits vorhanden");
      if (createdIds.length) setLastBulkAdd({ ids: createdIds, count: createdIds.length });
      setNewNote("");
      setRangeMode(false);
      setNewRangeEnd("");
      return;
    }
    const ok = await addEntry({ employeeId: selectedEmployee, date: newDate, type: newType, value: newValue, note: newNote });
    if (ok) setNewNote("");
  }

  // Spesen sind ein Monatsbetrag: gespeichert als ein einzelner Eintrag, datiert auf den 1. des Monats.
  async function updateOrCreateSpesenEntry(employeeId, existingEntry, rawValue) {
    const val = parseFloat(rawValue);
    if (!rawValue || isNaN(val) || val <= 0) {
      if (existingEntry) await deleteEntry(existingEntry.id);
      return;
    }
    if (existingEntry) {
      const { error } = await supabase.from("entries").update({ value: val }).eq("id", existingEntry.id);
      if (error) { showToast("Fehler beim Speichern."); return; }
      setEntries((prev) => prev.map((en) => (en.id === existingEntry.id ? { ...en, value: val } : en)));
      showToast("Gespeichert");
      return;
    }
    const dateISO = `${viewYear}-${pad(viewMonth + 1)}-01`;
    const payload = { employee_id: employeeId, objekt_id: null, date: dateISO, type: "spesen", value: val, note: null };
    const { data, error } = await supabase.from("entries").insert(payload).select().single();
    if (error) { showToast("Fehler beim Speichern."); return; }
    setEntries((prev) => [...prev, data]);
    showToast("Gespeichert");
  }

  function toggleObjRangeWeekday(idx) {
    setObjRangeWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function handleAddObjEntry() {
    if (objRangeMode && newObjRangeEnd && newObjRangeEnd >= newObjDate) {
      if (!newObjEmployeeId) { showToast("Bitte einen Mitarbeiter wählen"); return; }
      const start = new Date(newObjDate + "T00:00:00");
      const end = new Date(newObjRangeEnd + "T00:00:00");
      let skipped = 0;
      const createdIds = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const wd = d.getDay();
        if (!objRangeWeekdays.has(wd)) continue;
        const dateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const already = entries.some((en) => en.employee_id === newObjEmployeeId && en.date === dateISO && en.type === "arbeit");
        if (already) { skipped++; continue; }
        const created = await addEntry({ employeeId: newObjEmployeeId, date: dateISO, type: "arbeit", value: newObjValue, note: newObjNote, objektId: selectedObjekt, silent: true });
        if (created) createdIds.push(created.id);
      }
      showToast(createdIds.length ? `${createdIds.length} Einträge gespeichert${skipped ? `, ${skipped} übersprungen (schon vorhanden)` : ""}` : "Keine neuen Einträge – alle Tage bereits vorhanden");
      if (createdIds.length) setLastBulkAdd({ ids: createdIds, count: createdIds.length });
      setNewObjNote("");
      setObjRangeMode(false);
      setNewObjRangeEnd("");
      return;
    }
    const ok = await addEntry({ employeeId: newObjEmployeeId, date: newObjDate, type: "arbeit", value: newObjValue, note: newObjNote, objektId: selectedObjekt });
    if (ok) setNewObjNote("");
  }

  async function deleteEntry(id) {
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) { showToast("Fehler beim Löschen."); return; }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    showToast("Eintrag gelöscht");
  }

  async function undoBulkAdd() {
    if (!lastBulkAdd) return;
    const { error } = await supabase.from("entries").delete().in("id", lastBulkAdd.ids);
    if (error) { showToast("Fehler beim Rückgängigmachen."); return; }
    setEntries((prev) => prev.filter((en) => !lastBulkAdd.ids.includes(en.id)));
    showToast(`${lastBulkAdd.ids.length} Einträge rückgängig gemacht`);
    setLastBulkAdd(null);
  }

  function startEditEntry(e) {
    setEditingEntry({ id: e.id, date: e.date, type: e.type, objektId: e.objekt_id || "", employeeId: e.employee_id, value: e.value, note: e.note || "" });
  }

  function cancelEditEntry() { setEditingEntry(null); }

  async function saveEditEntry() {
    if (!editingEntry) return;
    const val = parseFloat(editingEntry.value);
    if (isNaN(val) || val < 0) { showToast("Bitte einen gültigen Wert eingeben"); return; }
    if (editingEntry.type === "arbeit" && !editingEntry.objektId) { showToast("Bitte ein Objekt wählen"); return; }
    if (!editingEntry.employeeId) { showToast("Bitte einen Mitarbeiter wählen"); return; }
    const patch = {
      employee_id: editingEntry.employeeId,
      date: editingEntry.date,
      type: editingEntry.type,
      value: val,
      note: editingEntry.note.trim() || null,
      objekt_id: editingEntry.type === "arbeit" ? editingEntry.objektId : null,
    };
    const { error } = await supabase.from("entries").update(patch).eq("id", editingEntry.id);
    if (error) { showToast("Fehler beim Speichern."); return; }
    setEntries((prev) => prev.map((en) => (en.id === editingEntry.id ? { ...en, ...patch } : en)));
    showToast("Gespeichert");
    setEditingEntry(null);
  }

  function exportBackup() {
    const payload = { exportedAt: new Date().toISOString(), employees, objekte, entries };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `dels-backup-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleLogout() {
    try {
      const today = todayISO();
      if (localStorage.getItem("dels_last_backup_date") !== today) {
        exportBackup();
        localStorage.setItem("dels_last_backup_date", today);
      }
    } catch (e) {
      // Backup ist ein Zusatz – ein Fehler hier darf das Abmelden nicht blockieren.
    }
    await supabase.auth.signOut();
  }

  if (loading) {
    return <div className="loading">Lade Daten …</div>;
  }

  if (section === "home") {
    return (
      <Dashboard
        employees={employees}
        objekte={objekte}
        monthTotals={monthTotals}
        yearFerienUsed={yearFerienUsed}
        onEnterStundentool={() => setSection("stundentool")}
        onEnterObjekte={() => setSection("objekte")}
        onLogout={handleLogout}
        email={session.user.email}
      />
    );
  }

  const sidebar = (
    <Sidebar
      section={section}
      onSwitchSection={setSection}
      stTab={stTab}
      setStTab={setStTab}
      onNewEmployee={() => setStTab("stammdaten")}
      objTab={objTab}
      setObjTab={setObjTab}
      objekte={objekte}
      selectedObjekt={selectedObjekt}
      onSelectObjekt={setSelectedObjekt}
      onNewObjekt={() => setShowNewObjekt(true)}
      onDeleteObjekt={(id) => setConfirmDelete({ kind: "objekt", id })}
      onExportPdf={() => window.print()}
      onExportBackup={exportBackup}
      onLogout={handleLogout}
      email={session.user.email}
    />
  );

  return (
    <div className="app-shell">
      {sidebar}
      <div className="main-area">
        {section === "stundentool" ? (
          stTab === "uebersicht" ? (
            !employees.length ? (
              <div className="main-content">
                <div className="card empty" style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 14, color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>Noch keine Mitarbeiter erfasst</p>
                  <p style={{ marginBottom: 16 }}>Füge den ersten Mitarbeiter hinzu, um die Monatsübersicht zu sehen.</p>
                  <button className="btn" style={{ maxWidth: 220, margin: "0 auto" }} onClick={() => setStTab("stammdaten")}>
                    + Mitarbeiter hinzufügen
                  </button>
                </div>
              </div>
            ) : (
            <>
              <div className="main-header">
                <div className="month-nav">
                  <button onClick={() => shiftMonth(-1)}>←</button>
                  <div className="label">{MONTH_NAMES[viewMonth]} {viewYear} · Alle Mitarbeiter</div>
                  <button onClick={() => shiftMonth(1)}>→</button>
                </div>
              </div>
              <div className="main-content">
                <MatrixLegend />
                <div className="sheet sheet-wide matrix-sheet">
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th className="matrix-name-col">
                          Mitarbeiter
                          <span className="matrix-resize-handle" onMouseDown={startNameColResize} title="Spaltenbreite ziehen"></span>
                        </th>
                        {monthDayNumbers(viewYear, viewMonth).map((d) => {
                          const wd = new Date(viewYear, viewMonth, d).getDay();
                          return (
                            <th key={d} className={`matrix-day-col ${wd === 0 || wd === 6 ? "weekend" : ""} ${`${viewYear}-${pad(viewMonth + 1)}-${pad(d)}` === todayISO() ? "is-today" : ""}`}>
                              <div className="matrix-day-wd">{WEEKDAY_SHORT[wd]}</div>
                              <div className="matrix-day-num">{pad(d)}</div>
                            </th>
                          );
                        })}
                        <th className="matrix-total-col">Arbeit</th>
                        <th className="matrix-total-col">Ferien</th>
                        <th className="matrix-total-col">Krank</th>
                        <th className="matrix-total-col">Unfall</th>
                        <th className="matrix-total-col">Sonst.</th>
                        <th className="matrix-total-col">Spesen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((e) => (
                        <EmployeeMatrixRow
                          key={e.id}
                          e={e}
                          days={monthDayNumbers(viewYear, viewMonth)}
                          year={viewYear}
                          month={viewMonth}
                          monthEntries={entriesForMonth(e.id, viewYear, viewMonth)}
                          totals={monthTotals(e.id, viewYear, viewMonth)}
                          objekteById={objekteById}
                          isExpanded={expandedEmployees.has(e.id)}
                          onToggleExpand={() => setExpandedEmployees((prev) => {
                            const next = new Set(prev);
                            if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                            return next;
                          })}
                          onSpesenChange={(employeeId, existingEntry, rawValue) => updateOrCreateSpesenEntry(employeeId, existingEntry, rawValue)}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="matrix-foot-row">
                        <td className="matrix-name-col">Monatstotal</td>
                        {monthDayNumbers(viewYear, viewMonth).map((d) => {
                          const dateISO = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
                          const total = entries
                            .filter((en) => en.type === "arbeit" && en.date === dateISO)
                            .reduce((s, en) => s + Number(en.value), 0);
                          return <td key={d} className="matrix-cell">{total ? fmtHours(total) : ""}</td>;
                        })}
                        <td className="matrix-total-col">
                          {fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).arbeit, 0))}
                        </td>
                        <td className="matrix-total-col">
                          {fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).ferien, 0))}
                        </td>
                        <td className="matrix-total-col">
                          {fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).krankheit, 0))}
                        </td>
                        <td className="matrix-total-col">
                          {fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).unfall, 0))}
                        </td>
                        <td className="matrix-total-col">
                          {fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).sonstiges + monthTotals(e.id, viewYear, viewMonth).feiertag, 0))}
                        </td>
                        <td className="matrix-total-col">
                          {fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).spesen, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
            )
          ) : (
            <>
              <div className="main-header">
                <div className="page-title">Mitarbeiterdaten</div>
              </div>
              <div className="main-content">
                <EmployeeMasterTable
                  employees={employees}
                  onUpdateField={updateEmployeeField}
                  onCreate={createEmployee}
                  onDelete={(id) => setConfirmDelete({ kind: "employee", id })}
                />
              </div>
            </>
          )
        ) : objTab === "absenzen" ? (
          <>
            <div className="main-header">
              <div className="month-nav">
                <button onClick={() => shiftMonth(-1)}>←</button>
                <div className="label">{MONTH_NAMES[viewMonth]} {viewYear} · Absenzen &amp; Spesen</div>
                <button onClick={() => shiftMonth(1)}>→</button>
              </div>
            </div>
            <div className="main-content">
              <p className="hint" style={{ marginTop: 0 }}>Ferien, Krankheit, Unfall, Feiertag, Sonstiges und Spesen — unabhängig von einem Objekt.</p>

              <div className="section-step">
                <span className="section-step-num">1</span>
                <span className="section-step-title">Monatsübersicht</span>
                <span className="section-step-hint">Alle Mitarbeiter · nur Ansicht</span>
              </div>
              <MatrixLegend />
              <div className="sheet sheet-wide matrix-sheet">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th className="matrix-name-col">
                        Mitarbeiter
                        <span className="matrix-resize-handle" onMouseDown={startNameColResize} title="Spaltenbreite ziehen"></span>
                      </th>
                      {monthDayNumbers(viewYear, viewMonth).map((d) => {
                        const wd = new Date(viewYear, viewMonth, d).getDay();
                        return (
                          <th key={d} className={`matrix-day-col ${wd === 0 || wd === 6 ? "weekend" : ""} ${`${viewYear}-${pad(viewMonth + 1)}-${pad(d)}` === todayISO() ? "is-today" : ""}`}>
                            <div className="matrix-day-wd">{WEEKDAY_SHORT[wd]}</div>
                            <div className="matrix-day-num">{pad(d)}</div>
                          </th>
                        );
                      })}
                      <th className="matrix-total-col">Arbeit</th>
                      <th className="matrix-total-col">Ferien</th>
                      <th className="matrix-total-col">Krank</th>
                      <th className="matrix-total-col">Unfall</th>
                      <th className="matrix-total-col">Sonst.</th>
                      <th className="matrix-total-col">Spesen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => (
                      <EmployeeMatrixRow
                        key={e.id}
                        e={e}
                        days={monthDayNumbers(viewYear, viewMonth)}
                        year={viewYear}
                        month={viewMonth}
                        monthEntries={entriesForMonth(e.id, viewYear, viewMonth)}
                        totals={monthTotals(e.id, viewYear, viewMonth)}
                        objekteById={objekteById}
                        isExpanded={expandedEmployees.has(e.id)}
                        onToggleExpand={() => setExpandedEmployees((prev) => {
                          const next = new Set(prev);
                          if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                          return next;
                        })}
                        onSpesenChange={(employeeId, existingEntry, rawValue) => updateOrCreateSpesenEntry(employeeId, existingEntry, rawValue)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="section-step">
                <span className="section-step-num">2</span>
                <span className="section-step-title">Absenz / Spesen erfassen</span>
                <span className="section-step-hint">Mitarbeiter wählen, dann Eintrag oder Zeitraum</span>
              </div>
              <div className="sheet">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 170 }}>Mitarbeiter</th>
                      <th style={{ width: 120 }}>Datum</th>
                      <th style={{ width: 150 }}>Typ</th>
                      <th style={{ width: 90 }}>Wert</th>
                      <th>Notiz</th>
                      <th style={{ width: 70 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      className="entry-form-row"
                      onKeyDown={(ev) => { if (ev.key === "Enter" && ev.target.tagName !== "BUTTON") { ev.preventDefault(); handleAddStEntry(); } }}
                    >
                      <td>
                        <select value={selectedEmployee || ""} onChange={(e) => setSelectedEmployee(e.target.value)}>
                          <option value="">– wählen –</option>
                          {employees.map((e2) => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                        <label className="range-toggle">
                          <input type="checkbox" checked={rangeMode} onChange={(e) => setRangeMode(e.target.checked)} /> Zeitraum
                        </label>
                        {rangeMode && (
                          <>
                            <input type="date" className="range-end" value={newRangeEnd} min={newDate} onChange={(e) => setNewRangeEnd(e.target.value)} placeholder="bis" />
                            <div className="range-weekdays">
                              {WEEKDAY_SHORT.map((label, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  className={`range-wd-btn ${rangeWeekdays.has(idx) ? "active" : ""}`}
                                  onClick={() => toggleRangeWeekday(idx)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </td>
                      <td>
                        <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                          {Object.entries(TYPES).filter(([k]) => k !== "arbeit").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </td>
                      <td><input type="number" min="0" step="0.25" value={newValue} onChange={(e) => setNewValue(e.target.value)} /></td>
                      <td><input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Notiz (optional)" /></td>
                      <td><button className="btn small full" onClick={handleAddStEntry}>{rangeMode && newRangeEnd ? "+ Zeitraum" : "+ Eintrag"}</button></td>
                    </tr>
                    {(() => {
                      if (!selectedEmployee) {
                        return <tr><td colSpan={6} className="empty">Mitarbeiter oben auswählen, um Absenzen/Spesen zu sehen oder zu erfassen.</td></tr>;
                      }
                      const list = entriesForMonth(selectedEmployee, viewYear, viewMonth).filter((e) => e.type !== "arbeit");
                      if (!list.length) {
                        return <tr><td colSpan={6} className="empty">Noch keine Einträge in diesem Monat.</td></tr>;
                      }
                      return list.map((e) => {
                        if (editingEntry && editingEntry.id === e.id) {
                          return (
                            <tr key={e.id} className="entry-form-row">
                              <td>
                                <select value={editingEntry.employeeId} onChange={(ev) => setEditingEntry((p) => ({ ...p, employeeId: ev.target.value }))}>
                                  <option value="">– wählen –</option>
                                  {employees.map((e2) => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
                                </select>
                              </td>
                              <td><input type="date" value={editingEntry.date} onChange={(ev) => setEditingEntry((p) => ({ ...p, date: ev.target.value }))} /></td>
                              <td>
                                <select value={editingEntry.type} onChange={(ev) => setEditingEntry((p) => ({ ...p, type: ev.target.value }))}>
                                  {Object.entries(TYPES).filter(([k]) => k !== "arbeit").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                              </td>
                              <td><input type="number" min="0" step="0.25" value={editingEntry.value} onChange={(ev) => setEditingEntry((p) => ({ ...p, value: ev.target.value }))} /></td>
                              <td><input type="text" value={editingEntry.note} onChange={(ev) => setEditingEntry((p) => ({ ...p, note: ev.target.value }))} /></td>
                              <td className="row-actions">
                                <button className="btn small" onClick={saveEditEntry}>Speichern</button>
                                <button className="btn small ghost" onClick={cancelEditEntry}>Abbr.</button>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={e.id}>
                            <td>{employees.find((x) => x.id === e.employee_id)?.name || "–"}</td>
                            <td>{formatDate(e.date)}</td>
                            <td><span className={`type-pill ${TYPES[e.type].cls}`}>{TYPES[e.type].label}</span></td>
                            <td>{fmtHours(e.value)} {TYPES[e.type].unit}</td>
                            <td>{e.note || "–"}</td>
                            <td className="row-actions">
                              <button className="edit-row" onClick={() => startEditEntry(e)}>Bearbeiten</button>
                              <button className="del-row" onClick={() => setConfirmDelete({ kind: "entry", id: e.id })}>Löschen</button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : !objekte.length ? (
          <div className="main-content">
            <div className="card empty" style={{ marginTop: 20 }}>
              <p style={{ fontSize: 14, color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>Noch keine Objekte erfasst</p>
              <p style={{ marginBottom: 16 }}>Füge das erste Objekt hinzu, um Stunden pro Standort zu erfassen.</p>
              <button className="btn" style={{ maxWidth: 220, margin: "0 auto" }} onClick={() => setShowNewObjekt(true)}>
                + Objekt hinzufügen
              </button>
            </div>
          </div>
        ) : objTab === "erfassung" ? (
          !objekt ? (
            <div className="main-content"><div className="card empty">Objekt auswählen</div></div>
          ) : (
            <>
              <div className="main-header">
                <div className="month-nav">
                  <button onClick={() => shiftMonth(-1)}>←</button>
                  <div className="label">{MONTH_NAMES[viewMonth]} {viewYear} · {objekt.name}</div>
                  <button onClick={() => shiftMonth(1)}>→</button>
                </div>
              </div>

              <div className="main-content">
                <div className="section-step">
                  <span className="section-step-num">1</span>
                  <span className="section-step-title">Objekt-Details</span>
                  <span className="section-step-hint">Adresse, Kunde, Notizen</span>
                </div>
                <div className="card objekt-meta-card">
                  <div className="objekt-meta-toggle" onClick={() => setObjektMetaOpen((v) => !v)}>
                    <span>Stammdaten {objekt.strasse || objekt.ort ? `· ${[objekt.strasse, objekt.ort].filter(Boolean).join(", ")}` : ""}</span>
                    <span className="objekt-meta-arrow">{objektMetaOpen ? "▲" : "▼"}</span>
                  </div>
                  {objektMetaOpen && (
                    <div className="objekt-meta-body">
                      <div className="row2">
                        <div className="field">
                          <label>Strasse</label>
                          <input defaultValue={objekt.strasse || ""} key={"str-" + objekt.id} onBlur={(e) => updateObjektField(objekt.id, "strasse", e.target.value.trim() || null)} />
                        </div>
                        <div className="field">
                          <label>Kunde/Ansprechperson</label>
                          <input defaultValue={objekt.kunde || ""} key={"kd-" + objekt.id} onBlur={(e) => updateObjektField(objekt.id, "kunde", e.target.value.trim() || null)} />
                        </div>
                      </div>
                      <div className="row2">
                        <div className="field">
                          <label>PLZ</label>
                          <input defaultValue={objekt.plz || ""} key={"plz-" + objekt.id} onBlur={(e) => updateObjektField(objekt.id, "plz", e.target.value.trim() || null)} />
                        </div>
                        <div className="field">
                          <label>Ort</label>
                          <input defaultValue={objekt.ort || ""} key={"ort-" + objekt.id} onBlur={(e) => updateObjektField(objekt.id, "ort", e.target.value.trim() || null)} />
                        </div>
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Notizen</label>
                        <textarea rows={2} defaultValue={objekt.notizen || ""} key={"not-" + objekt.id} onBlur={(e) => updateObjektField(objekt.id, "notizen", e.target.value.trim() || null)} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="section-step">
                  <span className="section-step-num">2</span>
                  <span className="section-step-title">Monatsübersicht</span>
                  <span className="section-step-hint">Stunden pro Mitarbeiter und Tag · nur Ansicht</span>
                </div>
                {(() => {
                  const list = entriesForObjektMonth(objekt.id, viewYear, viewMonth);
                  const totalStd = list.reduce((s, e) => s + Number(e.value), 0);
                  const empCount = new Set(list.map((e) => e.employee_id)).size;
                  return (
                    <div className="stats">
                      <div className="stat"><div className="n">{fmtHours(totalStd)}</div><div className="l">Std. total</div></div>
                      <div className="stat"><div className="n">{empCount}</div><div className="l">Mitarbeiter beteiligt</div></div>
                    </div>
                  );
                })()}

                <MatrixLegend />
                <div className="sheet sheet-wide matrix-sheet">
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th className="matrix-name-col">
                          Mitarbeiter
                          <span className="matrix-resize-handle" onMouseDown={startNameColResize} title="Spaltenbreite ziehen"></span>
                        </th>
                        {monthDayNumbers(viewYear, viewMonth).map((d) => {
                          const wd = new Date(viewYear, viewMonth, d).getDay();
                          return (
                            <th key={d} className={`matrix-day-col ${wd === 0 || wd === 6 ? "weekend" : ""} ${`${viewYear}-${pad(viewMonth + 1)}-${pad(d)}` === todayISO() ? "is-today" : ""}`}>
                              <div className="matrix-day-wd">{WEEKDAY_SHORT[wd]}</div>
                              <div className="matrix-day-num">{pad(d)}</div>
                            </th>
                          );
                        })}
                        <th className="matrix-total-col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp2) => {
                        const entriesByDate = {};
                        entriesForObjektMonth(objekt.id, viewYear, viewMonth)
                          .filter((en) => en.employee_id === emp2.id)
                          .forEach((en) => { entriesByDate[en.date] = en; });
                        const absencesByDate = {};
                        entriesForMonth(emp2.id, viewYear, viewMonth)
                          .filter((en) => en.type !== "arbeit" && en.type !== "spesen")
                          .forEach((en) => { absencesByDate[en.date] = en; });
                        return (
                          <ObjektMatrixRow
                            key={emp2.id}
                            emp={emp2}
                            days={monthDayNumbers(viewYear, viewMonth)}
                            year={viewYear}
                            month={viewMonth}
                            entriesByDate={entriesByDate}
                            absencesByDate={absencesByDate}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="section-step">
                  <span className="section-step-num">3</span>
                  <span className="section-step-title">Stunden erfassen</span>
                  <span className="section-step-hint">Neuer Eintrag oder Zeitraum · Liste diesen Monat</span>
                </div>
                <div className="sheet">
                  <table className="entries-table">
                    <thead>
                      <tr>
                        <th style={{ width: 120 }}>Datum</th>
                        <th style={{ width: 170 }}>Mitarbeiter</th>
                        <th style={{ width: 100, textAlign: "right" }}>Stunden</th>
                        <th>Notiz</th>
                        <th style={{ width: 70 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        className="entry-form-row"
                        onKeyDown={(ev) => { if (ev.key === "Enter" && ev.target.tagName !== "BUTTON") { ev.preventDefault(); handleAddObjEntry(); } }}
                      >
                        <td>
                          <input type="date" value={newObjDate} onChange={(e) => setNewObjDate(e.target.value)} />
                          <label className="range-toggle">
                            <input type="checkbox" checked={objRangeMode} onChange={(e) => setObjRangeMode(e.target.checked)} /> Zeitraum
                          </label>
                          {objRangeMode && (
                            <>
                              <input type="date" className="range-end" value={newObjRangeEnd} min={newObjDate} onChange={(e) => setNewObjRangeEnd(e.target.value)} placeholder="bis" />
                              <div className="range-weekdays">
                                {WEEKDAY_SHORT.map((label, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    className={`range-wd-btn ${objRangeWeekdays.has(idx) ? "active" : ""}`}
                                    onClick={() => toggleObjRangeWeekday(idx)}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </td>
                        <td>
                          <select value={newObjEmployeeId} onChange={(e) => setNewObjEmployeeId(e.target.value)}>
                            <option value="">– wählen –</option>
                            {employees.map((e2) => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
                          </select>
                        </td>
                        <td><input type="number" min="0" step="0.25" value={newObjValue} onChange={(e) => setNewObjValue(e.target.value)} /></td>
                        <td><input type="text" value={newObjNote} onChange={(e) => setNewObjNote(e.target.value)} placeholder="z.B. Fensterreinigung" /></td>
                        <td><button className="btn small full" onClick={handleAddObjEntry}>{objRangeMode && newObjRangeEnd ? "+ Zeitraum" : "+ Eintrag"}</button></td>
                      </tr>
                      {(() => {
                        const list = entriesForObjektMonth(objekt.id, viewYear, viewMonth);
                        if (!list.length) {
                          return (
                            <tr><td colSpan={5} className="empty">Noch keine Einträge in diesem Monat.</td></tr>
                          );
                        }
                        return list.map((e) => {
                          if (editingEntry && editingEntry.id === e.id) {
                            return (
                              <tr key={e.id} className="entry-form-row">
                                <td><input type="date" value={editingEntry.date} onChange={(ev) => setEditingEntry((p) => ({ ...p, date: ev.target.value }))} /></td>
                                <td>
                                  <select value={editingEntry.employeeId} onChange={(ev) => setEditingEntry((p) => ({ ...p, employeeId: ev.target.value }))}>
                                    <option value="">– wählen –</option>
                                    {employees.map((e2) => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
                                  </select>
                                </td>
                                <td><input type="number" min="0" step="0.25" value={editingEntry.value} onChange={(ev) => setEditingEntry((p) => ({ ...p, value: ev.target.value }))} /></td>
                                <td><input type="text" value={editingEntry.note} onChange={(ev) => setEditingEntry((p) => ({ ...p, note: ev.target.value }))} /></td>
                                <td className="row-actions">
                                  <button className="btn small" onClick={saveEditEntry}>Speichern</button>
                                  <button className="btn small ghost" onClick={cancelEditEntry}>Abbr.</button>
                                </td>
                              </tr>
                            );
                          }
                          const owner = employees.find((x) => x.id === e.employee_id);
                          return (
                            <tr key={e.id}>
                              <td className="cell-date">{formatDate(e.date)}</td>
                              <td className="cell-name">{owner ? owner.name : "–"}</td>
                              <td className="cell-num">{fmtHours(e.value)} Std.</td>
                              <td className={e.note ? "" : "cell-muted"}>{e.note || "–"}</td>
                              <td className="row-actions">
                                <button className="edit-row" onClick={() => startEditEntry(e)}>Bearbeiten</button>
                                <button className="del-row" onClick={() => setConfirmDelete({ kind: "entry", id: e.id })}>Löschen</button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        ) : (
          <>
            <div className="main-header">
              <div className="month-nav">
                <button onClick={() => shiftMonth(-1)}>←</button>
                <div className="label">{MONTH_NAMES[viewMonth]} {viewYear} · Alle Objekte</div>
                <button onClick={() => shiftMonth(1)}>→</button>
              </div>
            </div>
            <div className="main-content">
              <p className="hint" style={{ marginTop: 0 }}>Klicke ein Objekt an, um dort Stunden zu erfassen.</p>
              <div className="sheet">
                <table className="overview-table">
                  <thead><tr><th>Objekt</th><th>Std. total</th><th>Mitarbeiter beteiligt</th><th></th></tr></thead>
                  <tbody>
                    {objekte.map((o) => {
                      const list = entriesForObjektMonth(o.id, viewYear, viewMonth);
                      const total = list.reduce((s, e) => s + Number(e.value), 0);
                      const empCount = new Set(list.map((e) => e.employee_id)).size;
                      return (
                        <tr
                          key={o.id}
                          className="clickable-row"
                          title="Zur Erfassung dieses Objekts"
                          onClick={() => { setSelectedObjekt(o.id); setObjTab("erfassung"); }}
                        >
                          <td style={{ fontWeight: 600 }}>{o.name}</td>
                          <td>{fmtHours(total)}</td>
                          <td>{empCount}</td>
                          <td className="row-arrow">→</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {section === "stundentool" && (
        <div id="print-area" className="print-only">
          <div className="print-header">
            <img src={delsLogo} alt="DELS Reinigung & Beratung" className="print-logo" />
            <div className="print-title">Lohnabrechnung · {MONTH_NAMES[viewMonth]} {viewYear}</div>
          </div>
          <table className="matrix-table print-matrix-table">
            <thead>
              <tr>
                <th className="matrix-name-col">Mitarbeiter</th>
                {monthDayNumbers(viewYear, viewMonth).map((d) => {
                  const wd = new Date(viewYear, viewMonth, d).getDay();
                  return (
                    <th key={d} className={`matrix-day-col ${wd === 0 || wd === 6 ? "weekend" : ""}`}>
                      <div className="matrix-day-wd">{WEEKDAY_SHORT[wd]}</div>
                      <div className="matrix-day-num">{pad(d)}</div>
                    </th>
                  );
                })}
                <th className="matrix-total-col">Arbeit</th>
                <th className="matrix-total-col">Ferien</th>
                <th className="matrix-total-col">Krank</th>
                <th className="matrix-total-col">Unfall</th>
                <th className="matrix-total-col">Sonst.</th>
                <th className="matrix-total-col">Spesen</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <EmployeeMatrixRow
                  key={e.id}
                  e={e}
                  days={monthDayNumbers(viewYear, viewMonth)}
                  year={viewYear}
                  month={viewMonth}
                  monthEntries={entriesForMonth(e.id, viewYear, viewMonth)}
                  totals={monthTotals(e.id, viewYear, viewMonth)}
                  objekteById={objekteById}
                  isExpanded={false}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="matrix-foot-row">
                <td className="matrix-name-col">Monatstotal</td>
                {monthDayNumbers(viewYear, viewMonth).map((d) => {
                  const dateISO = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
                  const total = entries
                    .filter((en) => en.type === "arbeit" && en.date === dateISO)
                    .reduce((s, en) => s + Number(en.value), 0);
                  return <td key={d} className="matrix-cell">{total ? fmtHours(total) : ""}</td>;
                })}
                <td className="matrix-total-col">{fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).arbeit, 0))}</td>
                <td className="matrix-total-col">{fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).ferien, 0))}</td>
                <td className="matrix-total-col">{fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).krankheit, 0))}</td>
                <td className="matrix-total-col">{fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).unfall, 0))}</td>
                <td className="matrix-total-col">{fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).sonstiges + monthTotals(e.id, viewYear, viewMonth).feiertag, 0))}</td>
                <td className="matrix-total-col">{fmtHours(employees.reduce((s, e) => s + monthTotals(e.id, viewYear, viewMonth).spesen, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showNewObjekt && <NewObjektModal onCancel={() => setShowNewObjekt(false)} onCreate={createObjekt} />}
      {confirmDelete && (
        <ConfirmModal
          text={
            confirmDelete.kind === "employee" ? "Mitarbeiter und alle seine Einträge unwiderruflich löschen?" :
            confirmDelete.kind === "objekt" ? "Objekt löschen? Das geht nur, wenn keine Stunden mehr darauf gebucht sind." :
            "Diesen Eintrag löschen?"
          }
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            if (confirmDelete.kind === "employee") await deleteEmployee(confirmDelete.id);
            else if (confirmDelete.kind === "objekt") await deleteObjekt(confirmDelete.id);
            else await deleteEntry(confirmDelete.id);
            setConfirmDelete(null);
          }}
        />
      )}
      {lastBulkAdd && (
        <div className="undo-banner">
          <span>{lastBulkAdd.count} Einträge hinzugefügt</span>
          <button className="undo-btn" onClick={undoBulkAdd}>Rückgängig</button>
          <button className="undo-close" onClick={() => setLastBulkAdd(null)} title="Schliessen">✕</button>
        </div>
      )}
      {toastMsg && <div className="toast show">{toastMsg}</div>}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = noch am prüfen

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="loading">Lade …</div>;
  }
  if (!session) {
    return <Login onLoggedIn={() => {}} />;
  }
  return <MainApp session={session} />;
}
