import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "./supabaseClient.js";

const TYPES = {
  arbeit: { label: "Gearbeitet", unit: "Std.", cls: "type-arbeit" },
  ferien: { label: "Ferien", unit: "Tage", cls: "type-ferien" },
  krankheit: { label: "Krankheit", unit: "Tage", cls: "type-krankheit" },
  unfall: { label: "Unfall", unit: "Tage", cls: "type-unfall" },
  feiertag: { label: "Feiertag", unit: "Tage", cls: "type-feiertag" },
  sonstiges: { label: "Sonstiges", unit: "Tage", cls: "type-sonstiges" },
};
const MONTH_NAMES = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

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
        <h1>DELS Stundentool</h1>
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

// ---------- New employee modal ----------
function NewEmployeeModal({ onCancel, onCreate }) {
  const [name, setName] = useState("");
  const [ferien, setFerien] = useState(25);
  const [soll, setSoll] = useState(8.4);

  return (
    <div className="modal-bg">
      <div className="modal">
        <h3>Neuer Mitarbeiter</h3>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" autoFocus />
        </div>
        <div className="row2">
          <div className="field">
            <label>Ferienanspruch (Tage/Jahr)</label>
            <input type="number" step="0.5" value={ferien} onChange={(e) => setFerien(e.target.value)} />
          </div>
          <div className="field">
            <label>Soll-Std./Tag</label>
            <input type="number" step="0.1" value={soll} onChange={(e) => setSoll(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn ghost full" onClick={onCancel}>Abbrechen</button>
          <button
            className="btn full"
            onClick={() => {
              if (!name.trim()) return;
              onCreate({ name: name.trim(), ferienanspruch: parseFloat(ferien) || 0, soll_pro_tag: parseFloat(soll) || 8.4 });
            }}
          >
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Sidebar ----------
function Sidebar({ tab, setTab, employees, selectedEmployee, onSelectEmployee, onNewEmployee, onDeleteEmployee, onExport, onLogout, email }) {
  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div className="brand">
          <div className="dot"></div>
          <div>
            <h1>DELS Stundentool</h1>
            <div className="sub">Stunden, Ferien &amp; Absenzen</div>
          </div>
        </div>
      </div>

      <div className="sidebar-nav">
        <div className={`nav-item ${tab === "erfassung" ? "active" : ""}`} onClick={() => setTab("erfassung")}>Erfassung</div>
        <div className={`nav-item ${tab === "uebersicht" ? "active" : ""}`} onClick={() => setTab("uebersicht")}>Monatsübersicht</div>
      </div>

      <div className="sidebar-emp-section">
        <div className="sidebar-emp-title">Mitarbeiter</div>
        <div className="emp-list">
          {employees.map((e) => (
            <div
              key={e.id}
              className={`emp-item ${tab === "erfassung" && e.id === selectedEmployee ? "active" : ""}`}
              onClick={() => { onSelectEmployee(e.id); setTab("erfassung"); }}
            >
              <span>{e.name}</span>
              <button
                className="del"
                title="Mitarbeiter löschen"
                onClick={(ev) => { ev.stopPropagation(); onDeleteEmployee(e.id); }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button className="btn ghost full sidebar-add-btn" onClick={onNewEmployee}>+ Mitarbeiter</button>
      </div>

      <div className="sidebar-footer">
        <button className="btn secondary full" onClick={onExport}>CSV exportieren</button>
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
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("erfassung");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind, id }
  const [showNewEmployee, setShowNewEmployee] = useState(false);
  const [toastMsg, showToast] = useToast();

  const [newDate, setNewDate] = useState(todayISO());
  const [newType, setNewType] = useState("arbeit");
  const [newValue, setNewValue] = useState(8.4);
  const [newNote, setNewNote] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: emps, error: empErr }, { data: ents, error: entErr }] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("entries").select("*"),
    ]);
    if (empErr || entErr) {
      showToast("Fehler beim Laden der Daten.");
    } else {
      setEmployees(emps || []);
      setEntries(ents || []);
      if (!selectedEmployee && emps && emps.length) setSelectedEmployee(emps[0].id);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const emp = useMemo(() => employees.find((e) => e.id === selectedEmployee) || null, [employees, selectedEmployee]);

  useEffect(() => {
    if (emp) setNewValue(newType === "arbeit" ? emp.soll_pro_tag : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newType, emp?.id]);

  function entriesForMonth(employeeId, year, month) {
    return entries
      .filter((e) => e.employee_id === employeeId)
      .filter((e) => {
        const d = new Date(e.date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function monthTotals(employeeId, year, month) {
    const list = entriesForMonth(employeeId, year, month);
    const totals = { arbeit: 0, ferien: 0, krankheit: 0, unfall: 0, feiertag: 0, sonstiges: 0 };
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

  async function updateEmployeeField(field, value) {
    if (!emp) return;
    const { error } = await supabase.from("employees").update({ [field]: value }).eq("id", emp.id);
    if (error) { showToast("Fehler beim Speichern."); return; }
    setEmployees((prev) => prev.map((e) => (e.id === emp.id ? { ...e, [field]: value } : e)));
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

  async function addEntry() {
    if (!newDate) { showToast("Bitte ein Datum wählen"); return; }
    const val = parseFloat(newValue);
    if (isNaN(val) || val < 0) { showToast("Bitte einen gültigen Wert eingeben"); return; }
    const payload = { employee_id: selectedEmployee, date: newDate, type: newType, value: val, note: newNote.trim() || null };
    const { data, error } = await supabase.from("entries").insert(payload).select().single();
    if (error) { showToast("Fehler beim Speichern."); return; }
    setEntries((prev) => [...prev, data]);
    setNewNote("");
    showToast("Eintrag gespeichert");
  }

  async function deleteEntry(id) {
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) { showToast("Fehler beim Löschen."); return; }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    showToast("Eintrag gelöscht");
  }

  function exportCSV() {
    const rows = [["Mitarbeiter", "Datum", "Typ", "Wert", "Einheit", "Notiz"]];
    entries
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((e) => {
        const owner = employees.find((x) => x.id === e.employee_id);
        if (!owner) return;
        rows.push([owner.name, formatDate(e.date), TYPES[e.type].label, fmtHours(e.value), TYPES[e.type].unit, e.note || ""]);
      });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "dels-stundentool-export.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const sidebar = (
    <Sidebar
      tab={tab}
      setTab={setTab}
      employees={employees}
      selectedEmployee={selectedEmployee}
      onSelectEmployee={setSelectedEmployee}
      onNewEmployee={() => setShowNewEmployee(true)}
      onDeleteEmployee={(id) => setConfirmDelete({ kind: "employee", id })}
      onExport={exportCSV}
      onLogout={() => supabase.auth.signOut()}
      email={session.user.email}
    />
  );

  if (loading) {
    return (
      <div className="app-shell">
        {sidebar}
        <div className="main-area"><div className="loading">Lade Daten …</div></div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {sidebar}
      <div className="main-area">
        {!employees.length ? (
          <div className="main-content">
            <div className="card empty" style={{ marginTop: 20 }}>
              <p style={{ fontSize: 14, color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>Noch keine Mitarbeiter erfasst</p>
              <p style={{ marginBottom: 16 }}>Füge den ersten Mitarbeiter hinzu, um mit der Erfassung zu starten.</p>
              <button className="btn" style={{ maxWidth: 220, margin: "0 auto" }} onClick={() => setShowNewEmployee(true)}>
                + Mitarbeiter hinzufügen
              </button>
            </div>
          </div>
        ) : tab === "erfassung" ? (
          !emp ? (
            <div className="main-content"><div className="card empty">Mitarbeiter auswählen</div></div>
          ) : (
            <>
              <div className="main-header">
                <div className="month-nav">
                  <button onClick={() => shiftMonth(-1)}>←</button>
                  <div className="label">{MONTH_NAMES[viewMonth]} {viewYear} · {emp.name}</div>
                  <button onClick={() => shiftMonth(1)}>→</button>
                </div>
                <div className="emp-meta">
                  <div className="emp-meta-field">
                    <label>Ferienanspruch/Jahr</label>
                    <input
                      type="number" min="0" step="0.5" defaultValue={emp.ferienanspruch}
                      key={"fer-" + emp.id}
                      onBlur={(e) => updateEmployeeField("ferienanspruch", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="emp-meta-field">
                    <label>Soll-Std./Tag</label>
                    <input
                      type="number" min="0" step="0.1" defaultValue={emp.soll_pro_tag}
                      key={"soll-" + emp.id}
                      onBlur={(e) => updateEmployeeField("soll_pro_tag", parseFloat(e.target.value) || 8.4)}
                    />
                  </div>
                </div>
              </div>

              <div className="main-content">
                {(() => {
                  const totals = monthTotals(emp.id, viewYear, viewMonth);
                  const ferienJahr = yearFerienUsed(emp.id, viewYear);
                  const ferienRest = emp.ferienanspruch - ferienJahr;
                  return (
                    <div className="stats">
                      <div className="stat"><div className="n">{fmtHours(totals.arbeit)}</div><div className="l">Std. gearbeitet</div></div>
                      <div className="stat"><div className="n">{fmtHours(totals.ferien)}</div><div className="l">Ferientage</div></div>
                      <div className="stat"><div className="n">{fmtHours(totals.krankheit)}</div><div className="l">Kranktage</div></div>
                      <div className="stat"><div className="n">{fmtHours(totals.unfall)}</div><div className="l">Unfalltage</div></div>
                      <div className={`stat ${ferienRest < 0 ? "warn" : ""}`}><div className="n">{fmtHours(ferienRest)}</div><div className="l">Ferien Rest {viewYear}</div></div>
                    </div>
                  );
                })()}

                <div className="sheet">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 130 }}>Datum</th>
                        <th style={{ width: 150 }}>Typ</th>
                        <th style={{ width: 110 }}>Wert</th>
                        <th>Notiz</th>
                        <th style={{ width: 70 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="entry-form-row">
                        <td><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></td>
                        <td>
                          <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                        <td><input type="number" min="0" step="0.25" value={newValue} onChange={(e) => setNewValue(e.target.value)} /></td>
                        <td><input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="z.B. Auftrag Zürich" /></td>
                        <td><button className="btn small full" onClick={addEntry}>+ Eintrag</button></td>
                      </tr>
                      {(() => {
                        const list = entriesForMonth(emp.id, viewYear, viewMonth);
                        if (!list.length) {
                          return (
                            <tr><td colSpan={5} className="empty">Noch keine Einträge in diesem Monat.</td></tr>
                          );
                        }
                        return list.map((e) => (
                          <tr key={e.id}>
                            <td>{formatDate(e.date)}</td>
                            <td><span className={`type-pill ${TYPES[e.type].cls}`}>{TYPES[e.type].label}</span></td>
                            <td>{fmtHours(e.value)} {TYPES[e.type].unit}</td>
                            <td>{e.note || "–"}</td>
                            <td><button className="del-row" onClick={() => setConfirmDelete({ kind: "entry", id: e.id })}>Löschen</button></td>
                          </tr>
                        ));
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
                <div className="label">{MONTH_NAMES[viewMonth]} {viewYear} · Alle Mitarbeiter</div>
                <button onClick={() => shiftMonth(1)}>→</button>
              </div>
            </div>
            <div className="main-content">
              <div className="sheet">
                <table className="overview-table">
                  <thead><tr><th>Mitarbeiter</th><th>Gearbeitet (Std.)</th><th>Ferien (Tage)</th><th>Krankheit</th><th>Unfall</th><th>Sonstiges</th></tr></thead>
                  <tbody>
                    {employees.map((e) => {
                      const t = monthTotals(e.id, viewYear, viewMonth);
                      return (
                        <tr key={e.id}>
                          <td style={{ fontWeight: 600 }}>{e.name}</td>
                          <td>{fmtHours(t.arbeit)}</td>
                          <td>{fmtHours(t.ferien)}</td>
                          <td>{fmtHours(t.krankheit)}</td>
                          <td>{fmtHours(t.unfall)}</td>
                          <td>{fmtHours(t.sonstiges + t.feiertag)}</td>
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

      {showNewEmployee && <NewEmployeeModal onCancel={() => setShowNewEmployee(false)} onCreate={createEmployee} />}
      {confirmDelete && (
        <ConfirmModal
          text={confirmDelete.kind === "employee" ? "Mitarbeiter und alle seine Einträge unwiderruflich löschen?" : "Diesen Eintrag löschen?"}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            if (confirmDelete.kind === "employee") await deleteEmployee(confirmDelete.id);
            else await deleteEntry(confirmDelete.id);
            setConfirmDelete(null);
          }}
        />
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
