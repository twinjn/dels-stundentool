# Architektur

Dieses Dokument erklärt, **warum** das Projekt so aufgebaut ist. Das Wie
steht im Code, das Warum vergisst man nach drei Monaten.

## Überblick

```
   Browser
      |
      |  HTTP, Anfragen an /api/...
      v
   Express-API  (apps/api)          <-- prüft Rechte, spricht mit der DB
      |
      v
   PostgreSQL   (Docker-Container)
```

Dazu kommt ein drittes Paket, das kein eigener Dienst ist:

```
   packages/shared   <-- Typen, Validierung, Rechenlogik
        ^      ^
        |      |
      API    Browser
```

## Warum drei Arbeitsbereiche statt einem Ordner

Das Projekt ist ein *Monorepo*: ein Repository, mehrere Pakete, verwaltet
über npm-Workspaces.

| Paket | Aufgabe |
|---|---|
| `apps/api` | Der Server. Kennt die Datenbank, setzt Rechte durch |
| `apps/web` | Die Oberfläche im Browser. Kennt die Datenbank **nicht** |
| `packages/shared` | Alles, was beide brauchen: Typen, Zod-Schemas, Rechenlogik |

Der Gewinn steckt in `shared`. Ein Beispiel: die Rechte-Tabelle in
`shared/src/rollen.ts` wird vom Server benutzt, um Anfragen abzulehnen,
und vom Browser, um Knöpfe auszublenden. Es gibt sie nur einmal. Ohne das
gäbe es zwei Kopien, und irgendwann weichen sie voneinander ab. Genau so
entstehen Sicherheitslücken, bei denen der Knopf versteckt ist, die
Anfrage aber trotzdem durchgeht.

## Die wichtigste Sicherheitsregel

**Der Browser ist keine Sicherheitsgrenze.**

Alles, was im Browser läuft, kann der Benutzer lesen, verändern und
umgehen. Einen Knopf auszublenden verhindert gar nichts, es macht die
Oberfläche nur aufgeräumter. Wer die Adresse kennt, schickt die Anfrage
von Hand.

Sicherheit entsteht ausschliesslich an einer Stelle: die API prüft bei
**jeder** Anfrage selbst, wer da fragt und ob die Person das darf.

Das war bisher anders. Mit Supabase hat die Datenbank das über Row Level
Security erledigt. Diese Schutzschicht fällt weg. Deshalb gilt ab jetzt:
jede Route bekommt einen Guard, und jeder Guard bekommt einen Test.

## Wie eine Anfrage durchläuft

```
Browser
  -> src/api/client.ts        wirft bei Fehlerstatus einen echten Fehler
  -> Vite-Proxy (nur Entwicklung)
  -> helmet                   Sicherheits-Header
  -> cors                     erlaubte Herkunft
  -> express.json             Body zu Objekt, max. 1 MB
  -> cookieParser             Session-Cookie lesen
  -> Route                    die eigentliche Arbeit
  -> routeNichtGefunden       greift, wenn keine Route passte
  -> fehlerBehandlung         eine Stelle für alle Fehler
```

Die Reihenfolge in `apps/api/src/app.ts` ist keine Geschmacksfrage.
Express arbeitet sie von oben nach unten ab. Stünde `routeNichtGefunden`
weiter oben, würde es alle echten Routen verschlucken.

## Gleiche Herkunft in Entwicklung und Produktion

Der Browser behandelt `localhost:5173` und `localhost:3000` als zwei
verschiedene Websites. Cookies zwischen verschiedenen Herkünften sind
fehleranfällig (SameSite, Secure, CORS mit credentials).

Deshalb: der Vite-Dev-Server leitet alles unter `/api` im Hintergrund an
Express weiter. Für den Browser kommt damit alles von einer einzigen
Adresse. In Produktion liefert Express die gebaute Oberfläche gleich
selbst mit aus, dort ist es ohnehin dieselbe Herkunft.

`cors` bleibt trotzdem konfiguriert, streng auf `WEB_ORIGIN` begrenzt,
als zweite Verteidigungslinie und für den Fall, dass Oberfläche und API
später doch auf getrennten Domains landen.

## Die Sache mit dem `.js` beim Import

In `apps/api` und `packages/shared` steht in den Imports `.js`, obwohl die
Datei `.ts` heisst:

```ts
import { baueApp } from "./app.js";   // die Datei heisst app.ts
```

Das sieht falsch aus, ist aber richtig. Diese Pakete benutzen
`moduleResolution: "NodeNext"`, also die Auflösung, die Node selbst
verwendet. Node führt später die **kompilierte** Datei `app.js` aus, und
echte ECMAScript-Module verlangen die vollständige Dateiendung.
TypeScript übersetzt den Pfad nicht um, du schreibst also von Anfang an
den Namen, den die Datei zur Laufzeit hat.

`apps/web` ist davon ausgenommen. Dort bündelt Vite alles, deshalb steht
da `moduleResolution: "bundler"` und Endungen sind optional.

## `shared` muss vor `api` und `web` gebaut werden

`@dels/shared` wird als fertiges Paket eingebunden, nicht als loser
Quellcode. Sein `package.json` zeigt auf `dist/`. Das heisst: ohne
`npm run build -w @dels/shared` finden die anderen beiden nichts.

Im Alltag merkst du davon nichts, weil `npm run dev` den TypeScript-
Compiler für `shared` im Beobachtungsmodus mitlaufen lässt. In der CI
steht der Build-Schritt deshalb bewusst ganz vorne.

## Konfiguration scheitert laut

`apps/api/src/config.ts` prüft beim Start alle Umgebungsvariablen mit Zod
und beendet den Prozess mit einer verständlichen Meldung, wenn etwas
fehlt.

Das ist Absicht. Die Alternative wäre, dass die App startet und drei
Stunden später beim ersten Datenbankzugriff auf `undefined` läuft. Ein
Fehler beim Start kostet dich zehn Sekunden, ein Fehler im Betrieb einen
Abend.

## Wie die Anmeldung funktioniert

```
Anmeldung
  -> Passwort gegen argon2id-Hash prüfen
  -> 32 zufällige Bytes als Token würfeln
  -> SHA-256 davon in die Tabelle sitzungen
  -> Klartext-Token als httpOnly-Cookie an den Browser

Jede weitere Anfrage
  -> Middleware sitzungLesen: Cookie -> Hash -> Benutzer
  -> Wächter der Route: angemeldet? Recht vorhanden?
```

Drei Entscheidungen dahinter:

**Der Passwort-Hash ist argon2id, absichtlich langsam.** Wer eine gestohlene
Datenbank durchprobieren will, braucht pro Versuch 64 MB Arbeitsspeicher.
SHA-256 oder MD5 wären hier falsch, die sind auf Geschwindigkeit gebaut.

**In der Datenbank steht nur der Hash des Sitzungs-Tokens.** Wer an ein
Backup kommt, kann sich damit trotzdem nicht anmelden. Hier genügt SHA-256,
anders als beim Passwort: ein Token hat 256 Bit echten Zufall, das
probiert niemand durch.

**Fehlgeschlagene Anmeldungen sehen immer gleich aus.** Unbekannte E-Mail,
falsches Passwort, stillgelegtes Konto: dieselbe Meldung, dieselbe
Antwortzeit. Bei unbekannter E-Mail rechnen wir absichtlich gegen einen
Wegwerf-Hash, damit die Antwort nicht messbar schneller kommt. Sonst liesse
sich herausfinden, welche Adressen überhaupt ein Konto haben.

## Wie die Kalkulation portiert wurde

Der Rechenkern liegt in `packages/shared/src/kalkulation.ts` und ist eine
Zeile-für-Zeile-Übertragung von `legacy/src/kalkulation.js`, **in
derselben Reihenfolge der Rechenschritte**.

Das ist keine Bequemlichkeit. Gleitkommaaddition ist nicht assoziativ:
`(a+b)+c` kann sich von `a+(b+c)` im letzten Rappen unterscheiden. Beim
Portieren wurde das geprüft, indem absichtlich eine Klammer verschoben
wurde. Ergebnis: `114.01220404500003` statt `114.01220404500002`. Eine
Ziffer an der vierzehnten Stelle, allein durch Umstellen.

Geprüft wird die Portierung durch einen **Vergleichstest**
(`kalkulation.vergleich.test.ts`): 3000 zufällig erzeugte Szenarien
laufen durch beide Fassungen, und jede einzelne Zahl muss exakt
übereinstimmen. Das deckt mehr Fälle ab als ein einzelner echter Monat
und braucht keine Personendaten.

Der Test verschwindet zusammen mit `legacy/`. Genau dann wird er auch
nicht mehr gebraucht.

Dieselbe Funktion benutzen Browser und Server. Der Browser rechnet
sofort, während jemand an einem Ansatz dreht, und der Export auf dem
Server rechnet später mit derselben Logik. Es gibt keine zweite Fassung,
die auseinanderlaufen könnte.

## Was wo NICHT hingehört

- **Keine Datenbankzugriffe im Browser.** Der Browser kennt nur die API
- **Keine Geheimnisse mit `VITE_`-Präfix.** Alles mit diesem Präfix landet
  sichtbar im Browser-Bundle. Passwörter und Schlüssel niemals so benennen
- **Keine Rechnerei doppelt.** Was Zahlen berechnet, gehört nach `shared`
  und wird dort getestet
