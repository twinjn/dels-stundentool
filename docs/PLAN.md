# Plan: DELS Stundentool v2

## Ausgangslage

Version 1 (jetzt in `legacy/`) läuft produktiv: React mit Vite, Supabase
als Datenbank, Auth und API in einem. Fachlich ist sie weit, technisch
hat sie vier Schwächen:

- `src/App.jsx` mit 1701 Zeilen, jede Änderung riskant
- Nur eine Rolle: jeder eingeloggte Benutzer sieht AHV-Nummern, IBANs
  und Löhne
- Tests nur für die Kalkulation, kein Linter, keine CI
- Acht lose SQL-Dateien im Wurzelverzeichnis statt echter Migrationen

## Entscheid

Kompletter Neubau ohne Supabase, weil die Abhängigkeit von einem Anbieter
weg soll. Eigenes Backend, eigene Datenbank, eigene Authentifizierung.

| | |
|---|---|
| Datenbank | PostgreSQL, selbst betrieben im Container |
| Backend | Node.js mit Express 5, TypeScript |
| Datenbankzugriff | Drizzle ORM mit versionierten Migrationen |
| Frontend | React 19 mit Vite, TypeScript |
| Authentifizierung | Selbst gebaut: argon2id, Sessions in Postgres |
| Validierung | Zod, geteilt zwischen Server und Browser |
| Tests | Vitest, API-Tests gegen eine echte Datenbank |
| CI | GitHub Actions |

Bewusst **nicht** selbst gebaut: Passwort-Hashing. Dafür ist `argon2`
zuständig. Eigene Kryptographie ist der schnellste Weg zu einem Leck.

### Was der Ausstieg aus Supabase kostet

Nicht das Programmieren, sondern den Betrieb: Backups, TLS-Zertifikate,
Sicherheitsupdates, Erreichbarkeit. Das ist der eigentliche Preis und
deshalb eine eigene Phase, nicht ein Nachgedanke.

## Phasen

Jede Phase endet mit etwas Lauffähigem.

| | Phase | Inhalt | Stand |
|---|---|---|---|
| 0 | Fundament | Monorepo, TypeScript, Docker, Linter, CI | **fertig** |
| 1 | Datenbank | Schema, Migrationen, Importwerkzeug | **fertig**, Umzug der echten Daten offen |
| 2 | Auth | Login, Sessions, Rollen, Benutzerverwaltung | offen |
| 3 | Stammdaten | Mitarbeiter und Objekte, Layout, Navigation | offen |
| 4 | Stundenerfassung | Schnellerfassung, mobiltauglich | offen |
| 5 | Matrix | Monatsmatrix und Dashboard | offen |
| 6 | Kalkulation | Portierung mit Zahlenvergleich alt gegen neu | offen |
| 7 | Export | Excel und PDF, Lohnabrechnung | offen |
| 8 | Betrieb | Backup mit getestetem Restore, Audit-Log, Deployment | offen |

Das Altsystem in `legacy/` läuft parallel weiter, bis Phase 7 durch ist.
Erst dann wird umgeschaltet.

## Befund aus den Bestandsdaten (Stand September 2026)

| Tabelle | Zeilen |
|---|---|
| `entries` | **0** |
| `employees` | 9 |
| `objekte` | 39 |
| `kalk_monat` | 5 (Februar bis Juni 2026) |
| `kalk_objekt_monat` | 170 |
| `kalk_person_monat` | 45 |
| `kalk_adminkosten` | 120 |

Daraus folgt: die **Stundenerfassung wurde nie benutzt**, die Kalkulation
schon. Phase 4 baut deshalb nichts nach, sondern fängt bei der Frage an,
wie die Stunden heute wirklich ankommen.

AHV-Nummer und IBAN sind bei allen neun Mitarbeitern leer.

## Rechte-Modell

| Rolle | Darf |
|---|---|
| `admin` | Alles, inklusive Löhne, Kalkulation und Benutzerverwaltung |
| `buero` | Stunden und Stammdaten. Keine Löhne, keine Kalkulation |

Hinterlegt in `packages/shared/src/rollen.ts`, damit Server und Browser
dieselbe Quelle benutzen. Durchgesetzt wird es **ausschliesslich** in der
API.

## Regeln für dieses Projekt

1. **Die API prüft, der Browser verschönert.** Kein Recht wird allein
   durch Ausblenden im Frontend durchgesetzt
2. **Rechenlogik gehört nach `shared` und wird getestet.** Zahlen, die in
   der Lohnabrechnung landen, dürfen nicht still kippen
3. **Migrationen sind Dateien im Repository.** Kein Klicken in einer
   Oberfläche, kein Skript, das jemand von Hand ausführt
4. **`npm run check` muss grün sein, bevor etwas gepusht wird**
5. **Kein Backup ohne getesteten Restore.** Ein nie zurückgespieltes
   Backup ist kein Backup

## Offene Punkte

- Der Import ist gebaut und getestet, aber noch nicht ausgefuehrt. Dafür
  wird `SUPABASE_DATABASE_URL` in der `.env` gebraucht

- Dürfen `buero`-Benutzer IBAN, AHV-Nummer und Geburtsdatum sehen?
  Lohnfelder sind admin-only, der Rest ist zu klären (Phase 2)
- Stunden laufen heute über **Excel**, WhatsApp und Telefon sind geplant.
  Für Phase 4 heisst das: ein guter Excel-Import ist vermutlich mehr wert
  als eine schöne Eingabemaske, und die Maske muss fürs Abtippen taugen
- Wo läuft das Ganze später? Noch offen, blockiert aber nichts (Phase 8)
