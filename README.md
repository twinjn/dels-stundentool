# DELS Stundentool

Eigenständige Web-App zur Erfassung von Arbeitsstunden, Ferien, Krankheit und Unfall pro Mitarbeiter.

Aufgebaut mit **React (Vite)** im Frontend und **Supabase** (Postgres + Auth) als Backend. Läuft komplett kostenlos im Supabase Free Tier für diese Grösse.

## 1. Supabase-Projekt einrichten

1. Auf [supabase.com](https://supabase.com) kostenlosen Account erstellen und ein neues Projekt anlegen.
2. Im Dashboard unter **SQL Editor** die Datei `supabase-schema.sql` (in diesem Ordner) öffnen, den Inhalt kopieren und ausführen. Das erstellt die Tabellen `employees` und `entries` sowie die Sicherheitsregeln (nur eingeloggte Benutzer haben Zugriff).
3. Unter **Authentication → Users** für dich (den Chef) und jeden weiteren Admin manuell einen Benutzer anlegen, jeweils mit eigener E-Mail und Passwort. Alle eingeloggten Benutzer sehen dieselben Daten und können erfassen/löschen, es gibt keine Rollen-Unterscheidung. Willst du das später einschränken (z.B. manche dürfen nur lesen), müsste die RLS-Regel entsprechend erweitert werden.
4. Unter **Project Settings → API** findest du die **Project URL** und den **anon public key**. Diese beiden Werte brauchst du im nächsten Schritt.

## 2. Projekt lokal einrichten

```bash
npm install
cp .env.example .env
```

Öffne `.env` und trage die Werte aus Schritt 1.4 ein:

```
VITE_SUPABASE_URL=https://dein-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=dein-anon-key
```

Dann starten:

```bash
npm run dev
```

Die App läuft danach lokal (Adresse wird im Terminal angezeigt). Mit dem Account aus Schritt 1.3 einloggen.

## 3. Deployment (z.B. auf Netlify)

```bash
npm run build
```

Das erzeugt einen `dist`-Ordner. Diesen bei Netlify hochladen (oder das Repo verbinden und `npm run build` mit Publish-Verzeichnis `dist` einstellen). Die Umgebungsvariablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` müssen in den Netlify-Projekteinstellungen unter **Environment variables** ebenfalls gesetzt werden, sonst kann die App die Datenbank nicht erreichen.

## Wie die Daten geschützt sind

Die Datenbank ist per Row Level Security so eingestellt, dass nur eingeloggte Benutzer lesen oder schreiben können. Selbst wenn jemand die App-URL findet, kommt er ohne Login-Account nicht an die Daten. Alle Admin-Accounts (Chef + weitere) haben denselben vollen Zugriff, es gibt aktuell keine abgestuften Rechte.

## Funktionen

- Mitarbeiter anlegen/löschen, mit Stammdaten, GAV-Stufe, individuellem Ferienanspruch (Tage/Jahr) und Soll-Stunden pro Tag
- Einträge erfassen: Gearbeitet (Std.), Ferien, Krankheit, Unfall, Feiertag, Sonstiges (Tage), Spesen (CHF)
- Erfassung über einen Zeitraum mit Wochentagsauswahl, inkl. Rückgängig-Machen
- Objekte verwalten und Stunden pro Standort und Mitarbeiter buchen
- Monatsmatrix (Mitarbeiter × Tage) für Stunden und Absenzen, pro Mitarbeiter auf Objekte aufklappbar
- Kalkulation pro Monat: Deckungsbeitrag je Objekt, Sozialabgaben, Administrationsumlage und Ergebnis des Gesamtbetriebs
- Druckansicht der Monatsmatrix für die Lohnabrechnung (Knopf «PDF exportieren» im Stundentool)
- Backup aller Daten als JSON-Datei

## Tests

Der Rechenkern der Kalkulation (`src/kalkulation.js`) ist reine Rechenlogik ohne
React und Datenbank und ist mit Tests abgedeckt:

```bash
npm test
```

Die Tests brauchen keine Zusatzpakete und laufen mit dem Testrunner von Node
(ab Node 18). Wer an den Ansätzen oder der Umlage etwas ändert, sollte sie
vorher und nachher laufen lassen — die Zahlen dort landen in der Lohnabrechnung.
