/**
 * Baut die Express-Anwendung zusammen.
 *
 * Bewusst getrennt von server.ts: diese Funktion belegt keinen Port.
 * Dadurch koennen Tests die komplette App starten, Anfragen dagegen
 * schicken und wieder wegwerfen, ohne dass irgendwo ein Server haengen
 * bleibt.
 *
 * Die Reihenfolge der app.use(...) Aufrufe ist keine Geschmacksfrage.
 * Express arbeitet sie von oben nach unten ab wie eine Kette.
 */
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { fehlerBehandlung, routeNichtGefunden } from "./fehler.js";
import { healthRouter } from "./routes/health.js";

export function baueApp() {
  const app = express();

  // Verraet sonst in jedem Antwort-Header, dass hier Express laeuft.
  app.disable("x-powered-by");

  // Setzt eine Reihe von Sicherheits-Headern.
  app.use(helmet());

  // Der Browser laedt die Oberflaeche von Port 5173, die API liegt auf 3000.
  // Fuer den Browser sind das zwei verschiedene Herkuenfte, deshalb muss die
  // API ausdruecklich erlauben, dass von dort aus zugegriffen wird.
  // credentials: true ist noetig, damit das Session-Cookie mitgeschickt wird.
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));

  // Wandelt einen JSON-Body in req.body um. Die Grenze verhindert, dass
  // jemand die API mit einem 500-MB-Body lahmlegt.
  app.use(express.json({ limit: "1mb" }));

  // Liest Cookies aus. Das Geheimnis erlaubt signierte Cookies, damit
  // niemand den Inhalt im Browser von Hand umschreibt.
  app.use(cookieParser(config.SESSION_SECRET));

  // --- Routen ---------------------------------------------------------
  app.use("/api/health", healthRouter);

  // --- Abschluss ------------------------------------------------------
  // Beides muss ganz unten stehen, sonst schluckt es die echten Routen.
  app.use(routeNichtGefunden);
  app.use(fehlerBehandlung);

  return app;
}
