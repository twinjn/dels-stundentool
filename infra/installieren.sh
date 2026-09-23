#!/usr/bin/env bash
#
# Richtet das DELS Stundentool auf einem eigenen Server ein.
# Getestet gegen Ubuntu 24.04. Debian 12 sollte genauso gehen.
#
#   sudo infra/installieren.sh
#
# Das Skript ist mehrfach ausfuehrbar: was schon da ist, laesst es in
# Ruhe. Ein zweiter Lauf erzeugt also KEIN neues Passwort und wirft
# niemanden aus der Anwendung.
#
# Was es NICHT macht: TLS einrichten. Dafuer siehe infra/Caddyfile.beispiel.

set -euo pipefail

ZIEL="${ZIEL:-/opt/dels-stundentool}"
DATEN="${DATEN:-/var/lib/dels-stundentool}"
UMGEBUNG="${UMGEBUNG:-/etc/dels-stundentool.env}"
BENUTZER="${BENUTZER:-dels}"
DB_NAME="${DB_NAME:-dels}"
DB_BENUTZER="${DB_BENUTZER:-dels}"
DIENST="${DIENST:-dels-stundentool}"
# Nur die Vorbereitung durchspielen, nichts installieren.
TROCKEN="${TROCKEN:-nein}"

QUELLE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

sage() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
hinweis() { printf '    %s\n' "$*"; }
fehler() { printf '\n\033[1;31mFEHLER: %s\033[0m\n' "$*" >&2; exit 1; }

tun() {
  if [ "$TROCKEN" = "ja" ]; then
    hinweis "[trocken] $*"
  else
    "$@"
  fi
}

# --- Vorbedingungen ----------------------------------------------------

sage "Vorbedingungen pruefen"

if [ "$TROCKEN" != "ja" ] && [ "$(id -u)" -ne 0 ]; then
  fehler "Bitte mit sudo starten."
fi

command -v node >/dev/null 2>&1 || fehler \
  "Node.js fehlt. Installieren mit:
     curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
     sudo apt-get install -y nodejs"

NODE_HAUPT="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_HAUPT" -ge 22 ] || fehler "Node 22 oder neuer noetig, gefunden: $(node -v)"
hinweis "Node $(node -v)"

command -v psql >/dev/null 2>&1 || fehler \
  "PostgreSQL fehlt. Installieren mit:
     sudo apt-get install -y postgresql postgresql-client"
hinweis "PostgreSQL $(psql --version | awk '{print $3}')"

# Der Dienst ruft node unter diesem festen Pfad auf. Weicht er ab,
# startet der Dienst spaeter mit "No such file or directory", und die
# Ursache sucht man lange.
NODE_PFAD="$(command -v node)"
[ "$NODE_PFAD" = "/usr/bin/node" ] || hinweis \
  "Hinweis: node liegt unter $NODE_PFAD, der Dienst erwartet /usr/bin/node. Wird angepasst."

command -v pg_dump >/dev/null 2>&1 || fehler "pg_dump fehlt (Paket postgresql-client)."

command -v openssl >/dev/null 2>&1 || fehler "openssl fehlt."
command -v tar >/dev/null 2>&1 || fehler "tar fehlt."

# --- Benutzer ----------------------------------------------------------

sage "Systembenutzer $BENUTZER"

if id "$BENUTZER" >/dev/null 2>&1; then
  hinweis "gibt es schon"
else
  tun useradd --system --home-dir "$ZIEL" --shell /usr/sbin/nologin "$BENUTZER"
  hinweis "angelegt"
fi

# --- Datenbank ---------------------------------------------------------

sage "Datenbank $DB_NAME"

db_frage() {
  if [ "$TROCKEN" = "ja" ]; then echo ""; return; fi
  sudo -u postgres psql -tAc "$1" 2>/dev/null || true
}

if [ "$(db_frage "select 1 from pg_roles where rolname='$DB_BENUTZER'")" = "1" ]; then
  hinweis "Datenbankbenutzer gibt es schon, Passwort bleibt unveraendert"
  DB_PASSWORT=""
else
  DB_PASSWORT="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
  tun sudo -u postgres psql -c \
    "create role $DB_BENUTZER login password '$DB_PASSWORT'"
  hinweis "Datenbankbenutzer angelegt"
fi

if [ "$(db_frage "select 1 from pg_database where datname='$DB_NAME'")" = "1" ]; then
  hinweis "Datenbank gibt es schon"
else
  tun sudo -u postgres createdb -O "$DB_BENUTZER" "$DB_NAME"
  hinweis "Datenbank angelegt"
fi

# --- Anwendung bauen und kopieren --------------------------------------

sage "Anwendung bauen"

if [ ! -d "$QUELLE/node_modules" ]; then
  hinweis "npm ci laeuft, das dauert einen Moment"
  tun npm --prefix "$QUELLE" ci
fi
tun npm --prefix "$QUELLE" run build

sage "Nach $ZIEL kopieren"

# Mit tar und nicht mit rsync, aus zwei Gruenden: tar ist auf jedem
# System da, rsync nicht. Und der Weg ueber einen Nebenordner mit
# anschliessendem Tausch ist sicherer als ein "rsync --delete" direkt
# ins Ziel: bricht das Kopieren ab, steht dort noch die alte, ganze
# Fassung und nicht eine halbe neue.
#
# Die Sicherungen sind davon nicht betroffen, die liegen unter $DATEN.
kopieren() {
  rm -rf "$ZIEL.neu" "$ZIEL.alt"
  mkdir -p "$ZIEL.neu"
  tar -C "$QUELLE" \
    --exclude=./.git --exclude=./legacy --exclude=./backups \
    --exclude=./node_modules/.cache \
    -cf - . | tar -C "$ZIEL.neu" -xf -

  if [ -d "$ZIEL" ]; then
    mv "$ZIEL" "$ZIEL.alt"
  fi
  mv "$ZIEL.neu" "$ZIEL"
  rm -rf "$ZIEL.alt"
}

tun mkdir -p "$DATEN"
if [ "$TROCKEN" = "ja" ]; then
  hinweis "[trocken] wuerde $QUELLE nach $ZIEL kopieren"
else
  kopieren
fi
tun chown -R "$BENUTZER:$BENUTZER" "$ZIEL" "$DATEN"

# --- Einstellungen -----------------------------------------------------

sage "Einstellungen in $UMGEBUNG"

if [ -f "$UMGEBUNG" ]; then
  hinweis "gibt es schon, bleibt unveraendert"
  hinweis "Wird SESSION_SECRET geaendert, sind alle Benutzer abgemeldet."
else
  [ -n "$DB_PASSWORT" ] || fehler \
    "Der Datenbankbenutzer existiert, aber $UMGEBUNG fehlt. Dann kenne ich
das Passwort nicht. Entweder $UMGEBUNG von Hand anlegen, oder das
Passwort neu setzen:
  sudo -u postgres psql -c \"alter role $DB_BENUTZER password 'NEUES'\""

  SITZUNGSSCHLUESSEL="$(openssl rand -hex 32)"
  if [ "$TROCKEN" = "ja" ]; then
    hinweis "[trocken] wuerde $UMGEBUNG schreiben"
  else
    cat > "$UMGEBUNG" <<ENDE
# Einstellungen des DELS Stundentools.
# Von infra/installieren.sh angelegt. Enthaelt Geheimnisse.

NODE_ENV=production
PORT=3000

# Nur die eigene Maschine. Erreichbar wird die Anwendung ueber den
# Webserver davor (Caddy) oder ueber Tailscale. Stuende hier 0.0.0.0,
# waere sie zusaetzlich unter http://DIESER-RECHNER:3000 im ganzen
# Firmennetz erreichbar, ohne Verschluesselung.
HOST=127.0.0.1
DATABASE_URL=postgres://$DB_BENUTZER:$DB_PASSWORT@localhost:5432/$DB_NAME
SESSION_SECRET=$SITZUNGSSCHLUESSEL

# MUSS die oeffentliche Adresse sein, MIT https. Ueber reines http
# funktioniert die Anmeldung nicht: das Sitzungs-Cookie ist "secure".
WEB_ORIGIN=https://HIER-EINTRAGEN

# Anzahl Zwischenstationen davor. Hinter genau einem Webserver: 1.
TRUST_PROXY=1
ENDE
    chown root:root "$UMGEBUNG"
    chmod 600 "$UMGEBUNG"
  fi
  hinweis "angelegt, root:root 0600"
fi

# --- Dienst ------------------------------------------------------------

sage "systemd-Dienst $DIENST"

if [ "$TROCKEN" = "ja" ]; then
  hinweis "[trocken] wuerde /etc/systemd/system/$DIENST.service schreiben"
elif [ ! -d /run/systemd/system ]; then
  # Kommt in Containern vor. Kein Grund abzubrechen: der Rest der
  # Installation ist gueltig, nur der Dienst laesst sich hier nicht
  # eintragen. Frueher ist das Skript an dieser Stelle gestorben und hat
  # die Schlusshinweise nie ausgegeben.
  hinweis "systemd laeuft hier nicht (kein /run/systemd/system)."
  hinweis "Der Dienst wurde NICHT eingerichtet. Von Hand starten:"
  hinweis "  cd $ZIEL && env \$(grep -v \"^#\" $UMGEBUNG | xargs) node apps/api/dist/server.js"
else
  sed "s|/usr/bin/node|$NODE_PFAD|g" \
    "$QUELLE/infra/dels-stundentool.service" \
    > "/etc/systemd/system/$DIENST.service"
  systemctl daemon-reload
  hinweis "eingerichtet"
fi

# --- Schluss -----------------------------------------------------------

sage "Fertig. Was jetzt noch zu tun ist"
cat <<ENDE

  1. Adresse eintragen:
       sudo nano $UMGEBUNG
     Bei WEB_ORIGIN die echte Adresse mit https eintragen.

  2. Webserver mit TLS davorstellen, siehe infra/Caddyfile.beispiel.
     Ohne https funktioniert die Anmeldung nicht.

  3. Starten:
       sudo systemctl enable --now $DIENST
       systemctl status $DIENST

  4. Ersten Admin anlegen:
       cd $ZIEL
       sudo -u $BENUTZER env \$(grep -v '^#' $UMGEBUNG | xargs) \\
         node apps/api/dist/db/adminAnlegen.js

  5. Naechtliche Sicherung eintragen (crontab -e als root):
       0 2 * * * DATABASE_URL="..." BACKUP_ZIEL=$DATEN/backups $ZIEL/infra/backup.sh

  Nachsehen, ob es laeuft:
       curl -s http://127.0.0.1:3000/api/health
       journalctl -u $DIENST -f

ENDE
