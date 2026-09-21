# Entwicklung

## Was du brauchst

- **Node.js 22 oder neuer** ([nodejs.org](https://nodejs.org))
- **Docker Desktop** für die Datenbank ([docker.com](https://docker.com))

Prüfen:

```bash
node -v      # muss v22 oder höher zeigen
docker -v
```

## Einmalig einrichten

```bash
npm install                 # alle Pakete installieren
cp .env.example .env        # Konfiguration anlegen
```

Dann in der `.env` ein echtes Session-Geheimnis eintragen:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Die Ausgabe hinter `SESSION_SECRET=` einsetzen. Die `.env` steht in
`.gitignore` und landet nie im Repository.

## Täglich

```bash
npm run db:up      # Datenbank starten (einmal pro Rechnerstart)
npm run dev        # Shared-Compiler, API und Oberfläche zusammen starten
```

Danach läuft:

| Adresse | Was |
|---|---|
| http://localhost:5173 | Die Oberfläche |
| http://localhost:3000/api/health | Lebenszeichen der API |

Beenden mit `Strg+C`. Die Datenbank läuft weiter, bis du
`npm run db:down` ausführst. Die Daten bleiben dabei erhalten.

## Vor jedem Commit

```bash
npm run check
```

Das führt Formatierung, Linter, Typprüfung und Tests nacheinander aus.
Genau dasselbe macht die CI auf GitHub. Wenn es hier grün ist, ist es
dort auch grün.

Einzeln geht auch:

```bash
npm run format      # Formatierung automatisch korrigieren
npm run lint:fix    # was der Linter selbst reparieren kann
npm run typecheck
npm test
```

## Alle Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsmodus, alles zusammen |
| `npm run build` | Produktionsbau aller drei Pakete |
| `npm run check` | Formatierung, Linter, Typen, Tests |
| `npm run db:up` | Postgres im Container starten |
| `npm run db:down` | Postgres stoppen, Daten bleiben |
| `docker compose down -v` | Postgres stoppen **und alle Daten löschen** |

### Datenbank

| Befehl | Wirkung |
|---|---|
| `npm run db:generate -w @dels/api` | Migration aus `src/db/schema.ts` erzeugen |
| `npm run db:migrate -w @dels/api` | Migrationen anwenden (mehrfach ungefährlich) |
| `npm run db:studio -w @dels/api` | Daten im Browser anschauen |
| `npm run db:import -w @dels/api` | Daten aus dem Altsystem übernehmen |
| `npm run db:admin -w @dels/api` | Ersten Admin anlegen |
| `npm run db:import-excel -w @dels/api` | Stunden aus den Excel-Dateien übernehmen |

### Stunden aus Excel übernehmen

Das Kommando läuft **auf dem Rechner, auf dem die Dateien liegen**. Die
Dateien müssen nirgendwohin hochgeladen oder verschickt werden.

```bash
# Trockenlauf: liest, rechnet nach, vergleicht, schreibt NICHTS
npm run db:import-excel -w @dels/api -- --ordner "/Pfad/zu/2026"

# Wenn der Bericht passt:
npm run db:import-excel -w @dels/api -- --ordner "/Pfad/zu/2026" --schreiben
```

| Option | Wirkung |
|---|---|
| `--datei <pfad>` | eine einzelne Datei statt eines Ordners |
| `--schreiben` | wirklich in die Datenbank schreiben |
| `--ersetzen` | vorhandene Einträge der betroffenen Monate vorher löschen |
| `--fehlende-anlegen` | Mitarbeiter und Objekte anlegen, die es noch nicht gibt |
| `--jahr 2026` | Jahr vorgeben, falls es in der Datei fehlt |
| `--stammdaten` | zusätzlich das Blatt `Personal` übernehmen |

Der Trockenlauf vergleicht die eingelesenen Zahlen mit den Summenspalten,
die Excel selbst füllt (Arbeit, Ferien, Krank, Unfall). Weicht etwas ab,
steht es im Bericht. Man muss dem Import also nicht glauben, er prüft sich
gegen die Quelle.

### Den ersten Benutzer anlegen

Beim ersten Start gibt es noch kein Konto, und Konten anlegen darf nur ein
Admin. Dieses Henne-Ei-Problem löst ein Werkzeug, das direkt an der
Datenbank arbeitet:

```bash
npm run db:admin -w @dels/api
```

Es fragt Name, E-Mail und Passwort ab, das Passwort wird beim Tippen nicht
angezeigt. Automatisiert geht auch:

```bash
ADMIN_PASSWORT='...' npm run db:admin -w @dels/api -- --name "Anna Muster" --email anna@firma.ch
```

Ein zweites Mal lässt es sich nicht ausführen: sobald ein Admin existiert,
werden weitere Benutzer in der Anwendung angelegt.

Ablauf beim Ändern des Schemas: `src/db/schema.ts` anpassen, dann
`db:generate` (erzeugt eine SQL-Datei unter `apps/api/drizzle/`), diese
Datei **lesen**, dann `db:migrate`. Die erzeugte SQL-Datei kommt mit in
den Commit, sie ist der Nachweis, was an der Datenbank geändert wurde.

Ein einzelnes Paket ansprechen geht mit `-w`:

```bash
npm run dev -w @dels/api
npm test -w @dels/shared
```

## Wenn etwas klemmt

**"Cannot find module '@dels/shared'"**
Das gemeinsame Paket ist noch nicht gebaut:
```bash
npm run build -w @dels/shared
```

**"Konfiguration ist unvollstaendig oder falsch"**
Es fehlt eine `.env` oder ein Wert darin. Die Meldung sagt, welcher.

**"Keine Verbindung zum Server" in der Oberfläche**
Die API läuft nicht. Prüfen mit:
```bash
curl http://localhost:3000/api/health
```

**"port is already allocated" bei `npm run db:up`**
Auf Port 5432 läuft schon ein Postgres. Entweder das andere beenden oder
in `docker-compose.yml` und `.env` auf einen freien Port wechseln.

**Der Linter meckert über eine ungenutzte Variable, die du brauchst**
Einen Unterstrich voranstellen: `_req` statt `req`.

## Bekannte Meldung von `npm audit`

`npm audit` meldet vier Funde mittlerer Stufe in `esbuild`, eingeschleppt
über `drizzle-kit`:

> esbuild enables any website to send any requests to the development
> server and read the response

**Das ist für uns kein Risiko, und `npm audit fix --force` wäre falsch.**
Begründung:

- Die Lücke betrifft esbuilds eigenen **Entwicklungsserver**
  (`esbuild --serve`). Wir starten den nirgends
- `drizzle-kit` nutzt esbuild nur, um TypeScript-Dateien zu übersetzen.
  Nachprüfbar: `@esbuild-kit/core-utils` ruft ausschliesslich `transform`
  und `transformSync` auf, nie einen Server
- Der angebotene "Fix" würde `drizzle-kit` von 0.31 auf 0.18 zurückdrehen,
  also auf einen Stand von 2023

Wenn `drizzle-kit` die Abhängigkeit irgendwann ersetzt, verschwindet die
Meldung von selbst. Bis dahin: bekannt, geprüft, akzeptiert.

Die Lehre daraus gilt allgemein: ein Fund von `npm audit` ist ein Hinweis,
kein Urteil. Das Werkzeug kennt nur die Abhängigkeitsliste, nicht die
Frage, ob der verwundbare Code bei uns überhaupt läuft.

## Offener Punkt: Datumsfelder

Bei `<input type="date">` bestimmt der **Browser** das Anzeigeformat, nicht
die Seite. Auf einem deutschsprachigen Chrome erscheint TT.MM.JJJJ, auf
einem englischen mm/dd/yyyy. Der gespeicherte Wert ist immer ISO
(`2026-03-01`), verfälscht wird also nichts.

Im Testcontainer liess sich das nicht nachstellen: dem Headless-Chromium
fehlen die Sprachdaten, es zeigt immer das US-Format. Wer prüfen will, wie
es bei euch aussieht, öffnet die Mitarbeiterseite im echten Browser.

Falls das Format stört, wäre die Alternative ein eigenes Datumsfeld mit
Texteingabe und eigener Auswertung. Das kostet Aufwand und bringt eigene
Fehlerquellen mit, deshalb ist es bewusst nicht gebaut.

## Das Altsystem

Die alte Supabase-Version liegt unverändert in `legacy/` und bleibt
lauffähig, bis Version 2 fertig ist. Sie hat ihre eigenen Pakete und
gehört **nicht** zum Monorepo:

```bash
cd legacy
npm install
npm run dev
```

Dort wird nichts mehr weiterentwickelt. Wer sie anfassen muss, weil
produktiv etwas brennt, macht das dort und nur dort.
