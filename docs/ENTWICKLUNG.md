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
