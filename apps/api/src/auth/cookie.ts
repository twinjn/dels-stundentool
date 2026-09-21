/**
 * Einstellungen des Sitzungs-Cookies. Jede einzelne davon hat einen Grund.
 */
import type { CookieOptions } from "express";
import { istProduktion } from "../config.js";

export const SITZUNG_TAGE = 7;

export function cookieOptionen(): CookieOptions {
  return {
    // httpOnly: JavaScript im Browser kommt an dieses Cookie NICHT heran.
    // Damit kann ein eingeschleustes Skript die Sitzung nicht stehlen.
    httpOnly: true,

    // sameSite "lax": das Cookie wird nicht mitgeschickt, wenn eine fremde
    // Website eine Anfrage an uns ausloest. Das ist unser Hauptschutz gegen
    // Cross-Site-Request-Forgery, also dagegen, dass eine praeparierte Seite
    // im Namen eines angemeldeten Benutzers Daten aendert.
    sameSite: "lax",

    // secure: nur ueber HTTPS. Lokal laeuft die Entwicklung ueber http,
    // deshalb nur in Produktion. Ohne diese Ausnahme koenntest du dich
    // auf deinem eigenen Rechner nicht anmelden.
    secure: istProduktion,

    // Gilt fuer die ganze Anwendung.
    path: "/",

    maxAge: SITZUNG_TAGE * 24 * 60 * 60 * 1000,
  };
}

/** Beim Abmelden: dieselben Einstellungen, aber ohne Lebensdauer. */
export function cookieLoeschOptionen(): CookieOptions {
  const { maxAge: _maxAge, ...rest } = cookieOptionen();
  return rest;
}
