# DELS Stundentool

Erfassung von Arbeitsstunden, Absenzen und Spesen, Objektverwaltung und
monatliche Kalkulation mit Deckungsbeitrag.

## Aufbau

```
apps/api          Express-API, TypeScript          (der Server)
apps/web          React mit Vite, TypeScript       (die Oberfläche)
packages/shared   Typen, Validierung, Rechenlogik  (von beiden benutzt)
legacy/           Version 1 mit Supabase           (läuft noch produktiv)
docs/             Plan und Dokumentation
```

## Schnellstart

```bash
npm install
cp .env.example .env     # SESSION_SECRET darin ersetzen
npm run db:up            # Postgres im Container
npm run dev              # API und Oberfläche
```

Oberfläche: http://localhost:5173

## Dokumentation

| Datei | Inhalt |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Was gebaut wird, in welcher Reihenfolge, und warum |
| [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) | Wie das Projekt aufgebaut ist und warum so |
| [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md) | Einrichten, Befehle, Fehlersuche |
| [docs/BETRIEB.md](docs/BETRIEB.md) | Deployment, TLS, Sicherungen, Ernstfall |
| [docs/EXCEL-FORMAT.md](docs/EXCEL-FORMAT.md) | Aufbau der bestehenden Excel-Dateien |
| [docs/DESIGN.md](docs/DESIGN.md) | Hausfarben, Logo und warum Orange keine Schriftfarbe ist |
| [docs/EXPORT.md](docs/EXPORT.md) | Was exportiert wird, wer was bekommt, und der Weg zum PDF |

## Vor jedem Commit

```bash
npm run check
```

Formatierung, Linter, Typprüfung und Tests. Dasselbe läuft in der CI.
