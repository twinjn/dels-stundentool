/* Kleine Helfer fuer Datum und Zahlen, gemeinsam genutzt von der
   Startseite und dem Stundentool. */

export function pad(n) { return n < 10 ? "0" + n : "" + n; }

export function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
}

/** Stunden und Tage: hoechstens zwei Nachkommastellen, Komma als Trenner. */
export function fmtHours(n) {
  return (Math.round(Number(n) * 100) / 100).toString().replace(".", ",");
}

export const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
