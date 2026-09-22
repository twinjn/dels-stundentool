# Auf einem eigenen Server

> **Diese Befehle laufen auf einem LINUX-Server, nicht auf deinem
> Windows-Rechner.**
>
> `sudo`, `apt-get` und `systemctl` gibt es unter Windows nicht. Wer die
> Zeilen unten in die Windows-Eingabeaufforderung kopiert, bekommt
> zwölfmal "Der Befehl sudo ist entweder falsch geschrieben oder konnte
> nicht gefunden werden".
>
> Zum Ausprobieren auf einem Windows-Rechner gibt es WSL, siehe
> [Zum Üben auf Windows](#zum-üben-auf-windows) weiter unten.

Diese Anleitung geht von einem Linux-Server mit Ubuntu 24.04 oder Debian
12 aus. Ob der im Büro steht oder gemietet ist, spielt keine Rolle.

## Was der Server braucht

Wenig. Eure ganze Datenbank ist als Sicherung **148 KB** gross.

| | |
|---|---|
| CPU | 2 Kerne reichen |
| Arbeitsspeicher | 2 GB reichen, 1 GB geht auch |
| Platte | 20 GB, davon braucht die Anwendung selbst unter 1 GB |
| Software | Node.js 22 oder neuer, PostgreSQL 16 oder neuer |

## Was es wirklich kostet

Keine Lizenz, kein Abo, keine Rechnung an irgendwen. Alles, was die
Anwendung braucht, ist kostenlos: Ubuntu oder Debian, Node.js,
PostgreSQL, Caddy, Let's Encrypt, Tailscale im Gratis-Tarif.

Kostenlos heisst aber nicht kostenfrei. Der Strom zählt mit, und zwar
mehr, als man denkt. Gerechnet mit 28 Rappen je Kilowattstunde
(Grundversorgung, regional zwischen 8 und 37 Rappen):

| Gerät | Leistung | Strom pro Jahr |
|---|---|---|
| NAS, das ohnehin schon läuft | 0 W zusätzlich | **0 CHF** |
| Mini-PC oder Raspberry Pi 5 | rund 10 W | **rund 25 CHF** |
| alter Büro-Tower, sparsam | rund 40 W | rund 100 CHF |
| alter Büro-Tower, normal | rund 65 W | **rund 160 CHF** |

Zum Vergleich: ein gemieteter Server bei Hetzner kostet rund 60 CHF im
Jahr.

**Ein alter Tower, der Tag und Nacht läuft, ist also teurer als ein
gemieteter Server.** Das überrascht die meisten. Ein Mini-PC oder ein
vorhandenes NAS dagegen schlägt jedes Mietangebot deutlich.

Nicht im Strom enthalten und trotzdem echte Kosten:

- **Zeit.** Jemand muss Sicherheitsupdates einspielen. Das ist der
  eigentliche Preis des Selbstbetriebs, nicht der Strom
- **Eine eigene Domain**, falls gewünscht, rund 10 bis 15 CHF im Jahr.
  Mit Tailscale (Weg B weiter unten) braucht es keine
- **Ein Plan B**, falls die Maschine stirbt. Die Sicherungen gehören
  deshalb auf ein anderes Gerät

## Der Weg in zehn Minuten

```bash
# Voraussetzungen
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql postgresql-client git

# Quelltext holen und einrichten
git clone https://github.com/twinjn/dels-stundentool.git
cd dels-stundentool
sudo infra/installieren.sh
```

`installieren.sh` legt an: einen Systembenutzer `dels`, die Datenbank mit
einem erzeugten Passwort, die Anwendung unter `/opt/dels-stundentool`,
die Einstellungen unter `/etc/dels-stundentool.env` (root:root, 0600) und
den systemd-Dienst.

Das Skript ist **mehrfach ausführbar**. Ein zweiter Lauf spielt eine neue
Fassung ein und lässt Passwörter und Sitzungsschlüssel in Ruhe, wirft
also niemanden aus der Anwendung.

Danach noch drei Dinge:

```bash
# 1. Adresse eintragen
sudo nano /etc/dels-stundentool.env      # WEB_ORIGIN=https://...

# 2. Starten
sudo systemctl enable --now dels-stundentool
systemctl status dels-stundentool

# 3. Ersten Admin anlegen
cd /opt/dels-stundentool
sudo -u dels env $(grep -v '^#' /etc/dels-stundentool.env | xargs) \
  node apps/api/dist/db/adminAnlegen.js
```

## TLS ist keine Kür

Das Sitzungs-Cookie ist `secure`. Über reines `http` schickt der Browser
es nie zurück, und die **Anmeldung funktioniert schlicht nicht**. Die
Anwendung warnt beim Start, wenn `WEB_ORIGIN` auf `http://` zeigt.

Es gibt drei Wege, je nachdem wie der Server erreichbar sein soll.

### Weg A: eigene Domain, aus dem Internet erreichbar

```bash
sudo apt-get install -y caddy
sudo cp infra/Caddyfile.beispiel /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile           # Domain eintragen
sudo systemctl reload caddy
```

Caddy holt das Zertifikat von Let's Encrypt selbst und erneuert es auch
selbst. Kein certbot, kein Cronjob, kein abgelaufenes Zertifikat an einem
Sonntag. Voraussetzung: der DNS-Eintrag zeigt auf den Server, Port 80 und
443 sind offen.

### Weg B: Tailscale, nur für eure Geräte

Das ist der Weg, den ich für ein internes Werkzeug nehmen würde. Die
Anwendung ist dann **aus dem Internet gar nicht erreichbar**, nur aus
eurem eigenen Netz.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale serve --bg 3000
```

Tailscale bringt ein echtes Let's-Encrypt-Zertifikat für den Gerätenamen
mit, erreichbar unter `https://servername.euer-tailnet.ts.net`. Dafür
muss in der Tailscale-Konsole unter Settings, DNS zuerst MagicDNS und
dann HTTPS Certificates eingeschaltet sein, sonst scheitert `serve`.

Eine Grenze, die ihr vorher prüfen solltet: der Gratis-Tarif von
Tailscale umfasst **6 Benutzer** bei unbegrenzt vielen Geräten. Das
zählt nur, wer die Anwendung von **ausserhalb** des Büros erreichen
muss. Wer im Büro am Netz hängt, braucht Tailscale nicht. Für ein
Büro-Team von zwei bis fünf Leuten reicht es also.

Caddy braucht es dann nicht. `WEB_ORIGIN` auf die `ts.net`-Adresse
setzen.

### Weg C: nur im Firmennetz, ohne Tailscale

Ohne öffentliche Domain kann Let's Encrypt kein Zertifikat ausstellen.
Caddy stellt dann ein eigenes aus (`tls internal`) und richtet dafür eine
lokale Zertifizierungsstelle ein. Deren Wurzelzertifikat muss **einmal
auf jedem Arbeitsplatz** als vertrauenswürdig eingetragen werden, sonst
warnt jeder Browser:

```
/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt
```

Das ist der unbequemste Weg. Weg B spart genau diese Arbeit.

## Sicherungen

```bash
sudo crontab -e
```

```
0 2 * * * DATABASE_URL="postgres://dels:PASSWORT@localhost:5432/dels" BACKUP_ZIEL=/var/lib/dels-stundentool/backups /opt/dels-stundentool/infra/backup.sh
0 3 * * 0 DATABASE_URL="..." /opt/dels-stundentool/infra/backup-pruefen.sh
```

Der zweite Eintrag ist der wichtigere: er spielt die Sicherung
tatsächlich in eine Wegwerfdatenbank zurück und vergleicht jede Tabelle
Zeile für Zeile. Eine Sicherung, die nie zurückgespielt wurde, ist keine
Sicherung, sondern eine Datei.

Und dann noch woanders hin spiegeln. Eine Sicherung auf demselben Server
hilft gegen einen Bedienfehler, nicht gegen einen kaputten Server:

```
30 3 * * * rsync -a /var/lib/dels-stundentool/backups/ benutzer@anderer-ort:/sicherungen/dels/
```

## Neue Fassung einspielen

```bash
cd ~/dels-stundentool
git pull
sudo infra/installieren.sh          # baut neu und tauscht /opt aus
sudo systemctl restart dels-stundentool
```

Die Migrationen laufen beim Start mit, als `ExecStartPre`. Schlagen sie
fehl, startet der Dienst gar nicht, und das ist richtig so: eine
Anwendung auf einem halb migrierten Schema schreibt kaputte Daten.

**Vorher eine Sicherung ziehen**, auch wenn nichts dagegen spricht.

## Zum Üben auf Windows

Wer kein Linux zur Hand hat, aber die Anwendung einmal laufen sehen will,
nimmt WSL. Das ist ein echtes Ubuntu innerhalb von Windows.

In der PowerShell **als Administrator**:

```powershell
wsl --install
```

Danach den Rechner neu starten. Beim ersten Start fragt Ubuntu nach einem
Benutzernamen und einem Passwort, die sind frei wählbar. Ab da gilt die
ganze Anleitung von oben, eingetippt im Ubuntu-Fenster und nicht in der
Eingabeaufforderung.

Zwei Dinge, die dabei anders sind:

- **systemd läuft in WSL nicht immer.** Das Skript merkt das, richtet den
  Dienst dann nicht ein und sagt dir, wie du die Anwendung von Hand
  startest. Das ist kein Fehler
- **WSL ist zum Ausprobieren, nicht zum Betreiben.** Es läuft nur, solange
  du angemeldet bist. Als Server für das Büro taugt es nicht

### Wenn WSL nicht mitspielt

Kommt beim Anlegen des UNIX-Benutzers `Wsl/Service/E_UNEXPECTED`, liegt
das nicht am Namen. In dieser Reihenfolge probieren, in einer PowerShell
**als Administrator**:

```powershell
wsl --update
wsl --shutdown
wsl
```

Hilft das nicht, den WSL-Dienst neu starten (Start, "Dienste", Eintrag
"WSL Service", Rechtsklick, Neu starten). Als letztes Mittel die
Distribution wegwerfen und neu holen:

```powershell
wsl --unregister Ubuntu
wsl --install -d Ubuntu
```

Wer sich damit nicht aufhalten will, nimmt den Weg direkt unter Windows,
gleich darunter.

## Direkt unter Windows, ohne WSL

Zum Ausprobieren braucht es kein Linux. Die Anwendung selbst hat keine
Linux-Abhängigkeit: keine Shell-Aufrufe, alle Pfade mit `path.join`
gebaut. Nur die Skripte unter `infra/` sind Bash, und die braucht man
zum Ausprobieren nicht.

1. **Node.js 22** von nodejs.org installieren (LTS, Windows Installer)
2. **PostgreSQL** von postgresql.org installieren. Das Passwort, das
   dabei gesetzt wird, merken
3. In der mitgelieferten "SQL Shell (psql)" einmal:
   ```sql
   CREATE DATABASE dels;
   ```
4. Im Projektordner eine Datei `.env` anlegen, zwei Zeilen genügen:
   ```
   DATABASE_URL=postgres://postgres:DEIN-PASSWORT@localhost:5432/dels
   SESSION_SECRET=irgendeine-zeichenfolge-mit-mindestens-32-zeichen
   ```
   Alles andere hat brauchbare Vorgaben.
5. In der Eingabeaufforderung im Projektordner:
   ```
   npm ci
   npm run db:migrate -w @dels/api
   npm run db:admin -w @dels/api
   npm run dev
   ```
6. Browser auf http://localhost:5173

**Ehrlich dazu:** dieser Weg ist durchdacht, aber nicht ausprobiert, weil
hier kein Windows zur Verfügung stand. Geprüft ist nur, dass der
Anwendungscode nichts Linux-Eigenes benutzt.

Und wie WSL ist auch das eine Umgebung zum Anschauen, nicht zum
Betreiben: es läuft, solange das Fenster offen ist.

## Und wenn der Server Windows ist?

Dann laufen `installieren.sh`, der systemd-Dienst und die
Sicherungsskripte nicht: das sind alles Bash und Linux. Die Anwendung
selbst läuft, Node.js und PostgreSQL gibt es auch für Windows. Es fehlt
dann nur die Automatik drumherum, und die müsste für Windows neu
geschrieben werden.

Bevor jemand das angeht: erst klären, ob der Server wirklich Windows ist.

## Mit Docker statt von Hand

Geht auch, siehe `docker-compose.prod.yml`:

```bash
cp .env.prod.example .env
nano .env
docker compose -f docker-compose.prod.yml up -d --build
```

**Warnung, unverändert gültig:** der Docker-Bau ist nie ausprobiert
worden, weil in der Umgebung, in der er entstand, kein Docker-Daemon
lief. Der Weg über `installieren.sh` dagegen **ist** durchgespielt
worden, von der Installation über die Migrationen bis zur laufenden
Anwendung.

## Nachsehen, ob es läuft

```bash
systemctl status dels-stundentool
journalctl -u dels-stundentool -f
curl -s http://127.0.0.1:3000/api/health
```

Die Health-Antwort prüft auch die Datenbank. Eine API, die antwortet,
aber keine Datenbank hat, ist für den Benutzer genauso kaputt wie eine,
die gar nicht läuft.

## Was der Dienst absichert

`infra/dels-stundentool.service` schränkt ein, was der Prozess darf:
kein Schreiben ins Dateisystem ausser `/var/lib/dels-stundentool`, keine
Heimverzeichnisse, keine neuen Rechte, nur die Netzwerkfamilien, die
gebraucht werden.

Der Sitzungsschlüssel und das Datenbankpasswort stehen in einer Datei,
die **root gehört** und 0600 hat. systemd liest sie, bevor es auf den
Benutzer `dels` wechselt. Der Anwendungsbenutzer kann sie also nicht
lesen, selbst wenn jemand über die Anwendung eine Shell bekäme.

Eine Zeile steht dort bewusst **nicht**: `MemoryDenyWriteExecute=true`.
Node erzeugt zur Laufzeit Maschinencode und braucht dafür Speicher, der
beschreibbar und ausführbar ist. Mit dieser Zeile startet der Dienst
nicht.
