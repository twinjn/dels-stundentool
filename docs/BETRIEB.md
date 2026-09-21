# Betrieb

Wie die Anwendung auf einem Server läuft, und wie die Daten sicher
bleiben.

## Was du brauchst

- Einen Server mit Docker (ein kleiner VPS für 5 bis 10 Euro im Monat
  reicht für eure Grösse)
- Einen Domainnamen, der darauf zeigt
- **TLS.** Nicht optional, siehe unten

## Einrichten

```bash
git clone <repo> dels-stundentool
cd dels-stundentool
cp .env.prod.example .env
```

In der `.env` ausfüllen:

```bash
# Passwort für die Datenbank
openssl rand -base64 24

# Schlüssel für die Sitzungs-Cookies
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Dann starten:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Beim Start werden die Migrationen automatisch angewendet. Sie sind
mehrfach ausführbar, ein Neustart schadet also nie.

Den ersten Admin anlegen:

```bash
docker compose -f docker-compose.prod.yml exec app \
  node apps/api/dist/db/adminAnlegen.js --name "Dein Name" --email du@firma.ch
```

## TLS ist Pflicht, nicht Kür

Das Sitzungs-Cookie ist als `secure` gesetzt und wird vom Browser **nur
über HTTPS** zurückgeschickt. Läuft die Anwendung über reines `http`,
scheint die Anmeldung zu klappen und man ist sofort wieder abgemeldet.
Das ist ein Fehler, den man stundenlang sucht.

Die Anwendung warnt beim Start, wenn `WEB_ORIGIN` auf `http://` zeigt.

Die Anwendung lauscht nur auf `127.0.0.1:3000`. Davor gehört ein
Webserver mit TLS. Mit Caddy ist das eine Zeile:

```
stunden.deine-firma.ch {
    reverse_proxy localhost:3000
}
```

Caddy holt das Zertifikat selbst und erneuert es. Bei nginx muss
zusätzlich certbot eingerichtet werden.

`TRUST_PROXY=1` sagt der Anwendung, dass genau eine Zwischenstation davor
steht. Ohne das sieht sie bei allen Benutzern dieselbe IP, und die Sperre
nach fehlgeschlagenen Anmeldeversuchen trifft entweder alle oder
niemanden.

## Sicherungen

Ein eigener Container sichert täglich (Standard: 2 Uhr) und **prüft die
Sicherung anschliessend, indem er sie wirklich zurückspielt.**

Das ist der entscheidende Teil. Eine Sicherung, die nie zurückgespielt
wurde, ist keine Sicherung, sondern eine Hoffnung. Die häufigsten
Überraschungen sind eine abgebrochene Datei, eine falsche
Postgres-Version und fehlende Rechte beim Einspielen. Alle drei fallen in
der Wegwerf-Datenbank auf und nicht an dem Tag, an dem es darauf ankommt.

Die Dateien liegen in `backups/`, standardmässig 30 Tage lang.

### Von Hand

```bash
infra/backup.sh                 # sichern
infra/backup-pruefen.sh         # neueste Sicherung zurückspielen und vergleichen
infra/restore.sh <datei> <url>  # gezielt zurückspielen
```

`backup-pruefen.sh` legt eine Wegwerf-Datenbank an, spielt die Sicherung
ein, vergleicht **alle Tabellen Zeile für Zeile** mit dem Original und
räumt hinterher auf. Weicht etwas ab, endet es mit einem Fehler.

Beispielausgabe:

```
Tabelle                    Original      Kopie
-----------------------    --------   --------
benutzer                          2          2
eintraege                      3774       3774
mitarbeiter                     144        144
objekte                          35         35

Pruefung bestanden: alle Tabellen vollstaendig zurueckgespielt.
```

### Die Sicherungen gehören woanders hin

Sicherungen, die auf demselben Server liegen wie die Datenbank, helfen
gegen einen Bedienfehler, aber nicht gegen einen defekten Server. Den
Ordner `backups/` zusätzlich irgendwohin spiegeln, zum Beispiel:

```bash
rsync -a backups/ benutzer@anderer-server:/sicherungen/dels/
```

Als eigener Eintrag in der Crontab des Servers, nach der nächtlichen
Sicherung.

## Im Ernstfall zurückspielen

```bash
docker compose -f docker-compose.prod.yml stop app
infra/restore.sh backups/dels_JJJJ-MM-TT_HHMMSS.dump "$DATABASE_URL"
docker compose -f docker-compose.prod.yml start app
```

Die Anwendung vorher zu stoppen ist wichtig: sonst schreibt sie weiter,
während die Tabellen unter ihr ausgetauscht werden.

## Neue Fassung einspielen

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrationen laufen beim Start mit. **Vorher eine Sicherung ziehen**, auch
wenn nichts dagegen spricht:

```bash
infra/backup.sh
```

## Nachschauen, ob alles läuft

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
curl -s https://stunden.deine-firma.ch/api/health
```

Die Health-Antwort prüft auch die Datenbank. Eine API, die antwortet,
aber keine Datenbank hat, ist für den Benutzer genauso kaputt wie eine,
die gar nicht läuft.

## Was noch fehlt

Ehrlich aufgelistet, damit es niemanden überrascht:

- **Keine Benachrichtigung bei Fehlern.** Scheitert eine Sicherung, steht
  das nur im Containerlog. Wer täglich draufschaut, merkt es. Sonst
  braucht es eine Meldung per Mail oder Chat
- **Der Docker-Bau ist nicht ausprobiert.** Er wurde sorgfältig
  geschrieben, aber in der Umgebung, in der er entstand, lief kein
  Docker. Beim ersten `up -d --build` also genau hinschauen
- **Kein automatisches Ausrollen.** Ein neuer Stand braucht `git pull`
  und einen Befehl von Hand
