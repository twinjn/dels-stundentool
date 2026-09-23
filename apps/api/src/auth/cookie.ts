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
    // Website eine Anfrage an uns auslöst. Das ist unser Hauptschutz gegen
    // Cross-Site-Request-Forgery, also dagegen, dass eine präparierte Seite
    // im Namen eines angemeldeten Benutzers Daten ändert.
    sameSite: "lax",

    // secure: nur über HTTPS. Lokal läuft die Entwicklung über http,
    // deshalb nur in Produktion. Ohne diese Ausnahme könntest du dich
    // auf deinem eigenen Rechner nicht anmelden.
    secure: istProduktion,

    // Gilt für die ganze Anwendung.
    path: "/",

    maxAge: SITZUNG_TAGE * 24 * 60 * 60 * 1000,
  };
}

/** Beim Abmelden: dieselben Einstellungen, aber ohne Lebensdauer. */
export function cookieLoeschOptionen(): CookieOptions {
  const { maxAge: _maxAge, ...rest } = cookieOptionen();
  return rest;
}
