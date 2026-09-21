/**
 * Ein beschriftetes Eingabefeld mit Platz fuer eine Fehlermeldung.
 *
 * Das htmlFor/id-Paar ist nicht Deko: ohne das weiss ein Screenreader
 * nicht, welche Beschriftung zu welchem Feld gehoert, und ein Klick auf
 * die Beschriftung setzt den Cursor nicht ins Feld.
 */
import type { ReactNode } from "react";

type Eigenschaften = {
  id: string;
  beschriftung: string;
  wert: string;
  onChange: (wert: string) => void;
  typ?: "text" | "date" | "email" | "tel" | "password";
  hinweis?: string;
  fehler?: string | undefined;
  breit?: boolean;
  deaktiviert?: boolean;
};

export function Feld({
  id,
  beschriftung,
  wert,
  onChange,
  typ = "text",
  hinweis,
  fehler,
  breit,
  deaktiviert,
}: Eigenschaften) {
  return (
    <div className={breit ? "feld feld-breit" : "feld"}>
      <label htmlFor={id}>{beschriftung}</label>
      <input
        id={id}
        type={typ}
        value={wert}
        disabled={deaktiviert}
        aria-invalid={fehler ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {fehler ? <span className="feldfehler">{fehler}</span> : null}
      {!fehler && hinweis ? <span className="feldhinweis">{hinweis}</span> : null}
    </div>
  );
}

export function Kontrollkaestchen({
  id,
  beschriftung,
  wert,
  onChange,
}: {
  id: string;
  beschriftung: string;
  wert: boolean;
  onChange: (wert: boolean) => void;
}) {
  return (
    <div className="feld feld-kaestchen">
      <input id={id} type="checkbox" checked={wert} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{beschriftung}</label>
    </div>
  );
}

export function Feldgruppe({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <fieldset className="feldgruppe">
      <legend>{titel}</legend>
      <div className="feldraster">{children}</div>
    </fieldset>
  );
}
