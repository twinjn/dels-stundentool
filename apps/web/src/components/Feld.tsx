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

/**
 * Eine Auswahl aus festen Moeglichkeiten.
 *
 * Bewusst ein select und kein Freitextfeld: die Lohnart steuert, welche
 * Ferienrechnung gilt. Was man tippen kann, wird irgendwann vertippt,
 * und ein Tippfehler waere hier kein Schoenheitsfehler, sondern eine
 * falsche Abrechnung.
 */
export function Auswahl<T extends string>({
  id,
  beschriftung,
  wert,
  moeglichkeiten,
  onChange,
  hinweis,
  deaktiviert,
}: {
  id: string;
  beschriftung: string;
  wert: T;
  moeglichkeiten: readonly { wert: T; text: string }[];
  onChange: (wert: T) => void;
  hinweis?: string;
  deaktiviert?: boolean;
}) {
  return (
    <div className="feld">
      <label htmlFor={id}>{beschriftung}</label>
      <select
        id={id}
        value={wert}
        disabled={deaktiviert}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {moeglichkeiten.map((m) => (
          <option key={m.wert} value={m.wert}>
            {m.text}
          </option>
        ))}
      </select>
      {hinweis ? <span className="feldhinweis">{hinweis}</span> : null}
    </div>
  );
}
