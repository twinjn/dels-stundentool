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
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { sitzungLesen } from "./auth/guards.js";
import { config, istProduktion } from "./config.js";
import { fehlerBehandlung, routeNichtGefunden } from "./fehler.js";
import { authRouter } from "./routes/auth.js";
import { benutzerRouter } from "./routes/benutzer.js";
import { healthRouter } from "./routes/health.js";
import { kalkulationRouter } from "./routes/kalkulation.js";
import { mitarbeiterRouter } from "./routes/mitarbeiter.js";
import { objekteRouter } from "./routes/objekte.js";
import { protokollRouter } from "./routes/protokoll.js";
import { stundenRouter } from "./routes/stunden.js";

export function baueApp() {
  const app = express();

  // Verraet sonst in jedem Antwort-Header, dass hier Express laeuft.
  app.disable("x-powered-by");

  // Sagt Express, wie vielen Zwischenstationen es die Absender-IP glauben
  // darf. Wichtig fuer die Anmeldesperre, siehe config.ts.
  app.set("trust proxy", config.TRUST_PROXY);

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

  // Haengt den angemeldeten Benutzer an die Anfrage, falls das Cookie
  // gueltig ist. Lehnt selbst nichts ab, das machen die Waechter an den
  // einzelnen Routen.
  app.use(sitzungLesen);

  // --- Routen ---------------------------------------------------------
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/benutzer", benutzerRouter);
  app.use("/api/mitarbeiter", mitarbeiterRouter);
  app.use("/api/objekte", objekteRouter);
  app.use("/api/stunden", stundenRouter);
  app.use("/api/kalkulation", kalkulationRouter);
  app.use("/api/protokoll", protokollRouter);

  // --- Oberflaeche ----------------------------------------------------
  /**
   * In Produktion liefert Express die gebaute Oberflaeche gleich mit aus.
   *
   * Dadurch kommen Oberflaeche und API von derselben Adresse. Das spart
   * nicht nur einen zweiten Webserver, es erspart auch die ganze Klasse
   * von Cookie-Problemen, die entsteht, wenn der Browser die beiden fuer
   * verschiedene Websites haelt.
   *
   * Beim Entwickeln macht der Vite-Server dasselbe mit seinem Proxy.
   */
  if (istProduktion) {
    const hier = path.dirname(fileURLToPath(import.meta.url));
    const oberflaeche = path.resolve(hier, "../../web/dist");

    // Die gebauten Dateien tragen einen Hash im Namen. Aendert sich der
    // Inhalt, aendert sich der Name, also darf der Browser sie ewig
    // behalten.
    app.use(
      express.static(oberflaeche, {
        index: false,
        maxAge: "1y",
        immutable: true,
      }),
    );

    // Alles, was keine API-Anfrage ist, bekommt die Startseite. Das
    // braucht eine Anwendung mit eigenen Adressen: wer /kalkulation neu
    // laedt, soll nicht auf einen 404 laufen.
    // index.html darf NICHT zwischengespeichert werden, sonst bekommt der
    // Browser nach einer neuen Fassung weiter die alten Dateinamen.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(oberflaeche, "index.html"));
    });
  }

  // --- Abschluss ------------------------------------------------------
  // Beides muss ganz unten stehen, sonst schluckt es die echten Routen.
  app.use(routeNichtGefunden);
  app.use(fehlerBehandlung);

  return app;
}
