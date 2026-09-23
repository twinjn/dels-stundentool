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
| 2 | Auth | Login, Sessions, Rollen, Benutzerverwaltung | **fertig** |
| 3 | Stammdaten | Mitarbeiter und Objekte, Layout, Navigation | **fertig** |
| 4 | Stundenerfassung | Excel-Import und Erfassungsraster | **fertig** |
| 5 | Matrix | Startseite mit Lagemeldung, Jahresübersicht je Person | **fertig** |
| 6 | Kalkulation | Portierung mit Zahlenvergleich alt gegen neu | **fertig** |
| 7 | Export | Excel (Stunden, Kalkulation, Stammdaten), PDF über Drucken | **fertig**, Lohnabrechnung offen |
| 8 | Betrieb | Backup mit getestetem Restore, Audit-Log, Deployment | **fertig** |

Alle acht Phasen sind gebaut. Das Altsystem in `legacy/` bleibt als
Nachschlagewerk liegen, bis der Umstieg im Betrieb bestätigt ist.

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

### Warum `buero` IBAN und AHV-Nummer sieht

Das ist eine bewusste Entscheidung und kein Versehen, deshalb steht sie
hier.

`buero` sieht die **kompletten** Stammdaten: Adresse, Geburtsdatum,
Nationalität, AHV-Nummer und IBAN aller Mitarbeitenden. Nicht sichtbar
sind nur Stundenlohn, Monatslohn und die Kalkulation.

Die Trennung verläuft also entlang der Frage "was verdient jemand", nicht
entlang der Frage "wie heikel ist das Feld". Das ist ungewöhnlich, IBAN
und AHV-Nummer sind für sich genommen heikler als ein Stundenlohn.

Der Grund ist die Arbeitsteilung bei DELS: im Büro bereitet jeder
Zahlungen und Meldungen vor, und wer eine Überweisung auslösen soll,
braucht die Bankverbindung. Eine Rolle, die dafür jedes Mal beim Admin
nachfragen muss, wäre im Alltag nicht benutzbar, und benutzte Regeln
schlagen ungenutzte.

Die Entscheidung wurde zweimal getroffen: einmal beim Entwurf des
Rechte-Modells, und einmal wieder, als klar wurde, dass nicht ein oder
zwei Personen zugreifen, sondern das ganze Büro.

**Was daraus folgt:** Ein `buero`-Konto ist kein harmloses Konto. Wer
eines bekommt, hat Zugriff auf die Personendaten der ganzen Belegschaft.
Konten sparsam vergeben, beim Austritt sofort stilllegen (`aktiv`
wegnehmen, die Sitzung ist damit in derselben Sekunde ungültig), und im
Protokoll gelegentlich nachsehen, wer was angefasst hat.

Wer das später enger fassen will: eine dritte Rolle, die Stunden erfassen
darf, aber keine Personendaten sieht, ist in `rollen.ts` eine Zeile plus
ein zweiter Spaltensatz neben `OHNE_LOHN` in `routes/mitarbeiter.ts`.

## Kalkulation und Stammdaten: wie sie zusammenhängen

Eine Frage, die beim Aufbau lange offen lag: wenn jemand bei einem Objekt
ein neues Abo einträgt, soll das automatisch in der Kalkulation landen?

Die Antwort ist nein, und zwar aus einem Grund, der beim ersten Hinsehen
nicht auffällt. Ein Kalkulationsmonat ist eine Aufzeichnung, kein
Live-Bericht. Stunden und Stundenlöhne holt die Rechnung bei jedem
Öffnen frisch, die sind immer aktuell. Der Abo-Betrag dagegen steht fest
im Monat. Käme er live aus den Stammdaten, würde jede Preiserhöhung
still sämtliche Vergangenheit umschreiben, und die Zahlen, die letzten
Monat beim Treuhänder auf dem Tisch lagen, liessen sich nicht mehr
herstellen. Genau dieser Fehler steckte im alten Excel.

Gleichzeitig darf eine Abweichung nicht unsichtbar bleiben. Ein Objekt,
das nach dem Anlegen des Monats dazukam, fehlt in der Rechnung
vollständig, und niemand merkt es: es taucht in keiner Warnung auf, weil
es schlicht nicht da ist.

Daraus sind drei Bausteine geworden, die zusammen arbeiten:

**Preis-Historie** (`objekt_abo`). Nicht ein Preis je Objekt, sondern ein
Preis ab einem Datum. `objekte.abo_betrag` ist nur noch die Anzeige
davon, nämlich der Preis, der heute gilt; geschrieben wird er
ausschliesslich aus der Historie heraus. Ein neu angelegter
Kalkulationsmonat nimmt den Preis, der am Ersten jenes Monats galt. Eine
Erhöhung per 1. Juli verändert den Juni damit nicht mehr, und der Juli
bekommt sie automatisch, auch wenn ihn jemand erst im Herbst anlegt.

**Abgleich** (`kalkulation/abgleich.ts`). Zeigt beim Öffnen eines Monats,
was zwischen Stammdaten und Monat auseinanderläuft: fehlende Objekte,
abweichende Abos, im Stammblatt stillgelegte Objekte, die im Monat noch
mitzählen, und Personen mit erfassten Stunden ohne Zeile in der
Personalliste. Übernommen wird auf Knopfdruck und nur, was angehakt ist.
Der Server rechnet den Bericht beim Übernehmen neu und nimmt vom Browser
nur die Auswahl entgegen, nie einen Betrag.

**Monatsabschluss** (`kalk_monat.abgeschlossen_am`). Ein abgeschlossener
Monat nimmt keine Änderungen mehr an, durchgesetzt von einer Middleware
vor allen schreibenden Routen, nicht von einer Zeile in jeder einzelnen.
Wieder aufmachen geht, verlangt aber das Recht `kalkulation:schreiben`
und eine Begründung, die ins Protokoll wandert.

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

Stand 23. September 2026.

### Blockiert, dass das Büro zugreifen kann

- **Wo läuft es?** Mini-PC im Büro oder gemieteter Server. Zwei
  Teilfragen hängen dran: arbeitet jemand aus dem Homeoffice, und wer
  entscheidet, ob Personendaten das Gebäude verlassen dürfen. Zur Technik
  siehe `docs/SERVER.md`, zur Abwägung `docs/BETRIEB.md`
- **HTTPS.** Folgt aus der Frage oben und ist keine Kür: das
  Sitzungs-Cookie trägt in Produktion `secure`, und Browser speichern
  solche Cookies nur über HTTPS. Über blankes `http://` im Firmennetz
  kommt niemand rein, obwohl das Passwort stimmt
- **Konten.** Wer bekommt eines, mit Name und E-Mail. Die Rolle ist
  geklärt: das Büro bekommt `buero`, siehe die Begründung oben

### Sicherheit und Betrieb

- **Netlify baut aus diesem Repository den Ordner `legacy/`** und stellt
  die alte Supabase-Version öffentlich ins Netz. Im ausgelieferten Bundle
  stehen Projektadresse und Anon-Key. Nach den Schema-Dateien in
  `legacy/` ist Row Level Security überall aktiv und lässt nur
  angemeldete Benutzer durch, verifiziert ist das aber nicht. Prüfen,
  dann die Netlify-Anbindung trennen: die neue Anwendung kann dort
  ohnehin nicht laufen, Netlify liefert nur statische Dateien aus
- **Das alte Supabase-Projekt stilllegen**, sobald das neue Tool läuft.
  Es hält weiterhin alle Personendaten, und davon wegzukommen war der
  Zweck des Umbaus
- **Kein Restore wurde je durchgespielt.** Die Skripte liegen in `infra/`
  (`backup.sh`, `restore.sh`, `backup-pruefen.sh`), aber zurückgespielt
  hat sie noch niemand. Regel 5 dieses Projekts sagt, dass ein nie
  zurückgespieltes Backup kein Backup ist
- **Wohin soll eine Meldung, wenn eine Sicherung scheitert?**

### Daten

- **Oktober und Dezember 2026 enthalten Stunden, November nicht.** Beides
  liegt in der Zukunft. Entweder ist vorausgeplant, oder in einer Zelle
  steht ein vertipptes Datum. Ein falsches Jahr importiert das Tool
  klaglos mit
- **Importiert ist nur 2026.** Ob frühere Jahre dazusollen, ist offen
- **Die Verwaltungsdatei ist nicht eingelesen.** Der Personalstamm kam
  aus dem Blatt "Personal" der Objektdateien. Ob die Verwaltungsdatei
  zusätzlich etwas beiträgt (Adressen, AHV, IBAN), ist ungeprüft

### Funktionen

- **Keine Lohnabrechnung.** War in Phase 7 mitgedacht, braucht aber
  Entscheide, die noch nicht gefallen sind

### Qualität

- **Die Oberflächentests decken drei Stellen ab**: API-Klient,
  Passwortseite, Ferienseite. Stundenraster, Kalkulation und
  Mitarbeiterformular haben keine. Das Stundenraster ist davon das
  wichtigste, da wird täglich getippt

### Erledigt seit der letzten Fassung

- ~~Wie bildet sich der Ferien-Saldo?~~ Geklärt und gebaut: getrennt nach
  Monats- und Stundenlohn, Übertrag wird gerechnet, anteiliger Anspruch
  über Kalendertage. Siehe `apps/api/src/ferien/`
- ~~Sollen die Objektdateien importiert werden?~~ Erledigt: 53 Dateien,
  3980 Einträge, 144 Personen, 32 Objekte. Der Abgleich gegen die Summen,
  die Excel selbst anzeigt, ergab keine Abweichung
- ~~Wer bekommt welche Rolle?~~ Das Büro bekommt `buero`. Offen sind nur
  noch die konkreten Namen und E-Mail-Adressen
- ~~Der Docker-Bau ist nicht ausprobiert.~~ Die CI baut das Bild bei jedem
  Push, startet den Container gegen eine echte Datenbank und prüft
  Gesundheit, Oberfläche und Routen

### Geklärt: die Objektdateien werden benutzt

Die ersten beiden Muster (10001, 10019) waren leer, deshalb blieb lange
offen, ob diese Ebene überhaupt geführt wird. Eine dritte Datei enthält
Daten, und der Leser wurde daran geprüft:

| | |
|---|---|
| Arbeitsstunden im Jahr | 376.00 |
| Ferientage | 11 |
| Personen auf dem Objekt | 1 |
| Warnungen | keine |

Jeder einzelne Monat stimmt mit der Summenspalte des Blatts überein, und
eine unabhängig geschriebene Nachrechnung kommt auf dieselben Zahlen.
Auch die Dateierkennung stimmt: Typ `objekt`, Jahr 2026, Objektnummer
und Stand werden richtig gelesen.

Zwei Eigenheiten des Formats, die dabei bestätigt wurden:

- **Am Blattende steht eine Summenzeile** ("Monatstotal Arbeitstunden").
  Wer sie als Person mitzählt, verdoppelt jede Zahl. Beim ersten
  Nachrechnen ist mir genau das passiert, und die Gegenprobe stimmte
  trotzdem, weil beide Seiten verdoppelt waren
- **Das 31-Spalten-Raster gilt auch hier.** In einem 30-Tage-Monat trägt
  die letzte Spalte schon den ersten des Folgemonats

### Geklärt: das Anzeigeformat der Datumsfelder

Die Frage war, ob `<input type="date">` bei euch TT.MM.JJJJ zeigt.

Geprüft, mit einem Ergebnis in zwei Teilen:

1. **Der Wert ist immer ISO.** Egal wie der Browser das Feld darstellt,
   an unseren Code und an den Server geht `JJJJ-MM-TT`. Nachgemessen im
   Browser, auch nach einer Tastatureingabe. Ein Datenrisiko gibt es also
   nicht, nur eine Anzeigefrage
2. **Die Darstellung hängt an der Ländereinstellung des Betriebssystems**,
   nicht an der Seite und nicht an der Browsersprache. In der Umgebung
   hier gibt es nur die Locale `C`, deshalb zeigt der Browser MM/TT/JJJJ,
   auch mit `--lang=de-CH` und deutschem Sprachpaket. Auf einem Windows,
   das auf Deutsch (Schweiz) steht, wird TT.MM.JJJJ angezeigt

Bestätigen lässt sich Punkt 2 nur auf einem eurer Rechner. Falls dort
doch MM/TT/JJJJ steht, liegt es an der Windows-Regionseinstellung, nicht
an der Anwendung.
