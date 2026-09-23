/**
 * Rollen und Rechte.
 *
 * Warum das hier im gemeinsamen Paket liegt und nicht in der API:
 * Server und Browser müssen dieselbe Vorstellung davon haben, wer was darf.
 * Der Server, weil er es durchsetzt. Der Browser, weil er Knöpfe ausblendet,
 * die der Benutzer ohnehin nicht drücken darf.
 *
 * WICHTIG: Das Ausblenden im Browser ist KEINE Sicherheit. Wer die Seite
 * kennt, schickt die Anfrage auch ohne Knopf. Sicherheit entsteht
 * ausschliesslich dadurch, dass die API jede Anfrage selbst prüft.
 */

export const ROLLEN = ["admin", "buero"] as const;
export type Rolle = (typeof ROLLEN)[number];

export const RECHTE = [
  "stunden:lesen",
  "stunden:schreiben",
  "stammdaten:lesen",
  "stammdaten:schreiben",
  "loehne:lesen",
  "loehne:schreiben",
  "kalkulation:lesen",
  "kalkulation:schreiben",
  "benutzer:verwalten",
] as const;
export type Recht = (typeof RECHTE)[number];

/**
 * Wer darf was. Büro deckt den Alltag ab: Stunden und Stammdaten.
 * Löhne, Kalkulation und Benutzerverwaltung bleiben beim Admin.
 */
const RECHTE_JE_ROLLE: Record<Rolle, readonly Recht[]> = {
  admin: RECHTE,
  buero: ["stunden:lesen", "stunden:schreiben", "stammdaten:lesen", "stammdaten:schreiben"],
};

export function hatRecht(rolle: Rolle, recht: Recht): boolean {
  return RECHTE_JE_ROLLE[rolle].includes(recht);
}

export function rechteVon(rolle: Rolle): readonly Recht[] {
  return RECHTE_JE_ROLLE[rolle];
}

/** Prüft zur Laufzeit, ob ein unbekannter Wert eine gültige Rolle ist. */
export function istRolle(wert: unknown): wert is Rolle {
  return typeof wert === "string" && (ROLLEN as readonly string[]).includes(wert);
}
