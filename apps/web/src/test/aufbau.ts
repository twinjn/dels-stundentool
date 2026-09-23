/**
 * Läuft vor jeder Testdatei der Oberflaeche.
 *
 * Zwei Aufgaben: die zusätzlichen Vergleiche von jest-dom anmelden
 * (toBeInTheDocument, toBeDisabled und so weiter), und nach jedem Test
 * aufräumen, damit die nächste Prüfung nicht Reste der vorherigen
 * im Dokument findet.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  // Nachgebaute Funktionen zuruecksetzen, sonst schleppt ein Test die
  // Antworten des vorherigen mit und niemand findet, warum.
  vi.restoreAllMocks();
});
