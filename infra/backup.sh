#!/usr/bin/env bash
#
# Sichert die Datenbank.
#
#   infra/backup.sh [zielordner]
#
# Erwartet DATABASE_URL in der Umgebung oder in der .env im Wurzelordner.
#
# Format ist das eigene Format von Postgres (-Fc), nicht reines SQL:
# es ist komprimiert, laesst sich teilweise zurueckspielen und pg_restore
# kann den Inhalt auflisten, ohne ihn einzuspielen. Genau das nutzen wir
# unten als erste Pruefung.
set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIEL="${1:-$WURZEL/backups}"
BEHALTEN_TAGE="${BACKUP_BEHALTEN_TAGE:-30}"

if [[ -z "${DATABASE_URL:-}" && -f "$WURZEL/.env" ]]; then
  # Nur DATABASE_URL herausziehen, nicht die ganze Datei ausfuehren:
  # ein Passwort mit einem Dollarzeichen wuerde sonst ausgewertet.
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$WURZEL/.env" | head -1 | cut -d= -f2-)"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL fehlt. Entweder in der Umgebung setzen oder in die .env schreiben." >&2
  exit 1
fi

mkdir -p "$ZIEL"
STEMPEL="$(date +%Y-%m-%d_%H%M%S)"
DATEI="$ZIEL/dels_${STEMPEL}.dump"

echo "Sichere nach $DATEI ..."
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$DATEI"

# Erste Pruefung: laesst sich das Inhaltsverzeichnis lesen? Eine abgebrochene
# oder halb geschriebene Datei faellt hier sofort auf.
ANZAHL="$(pg_restore --list "$DATEI" | grep -c '^[0-9]' || true)"
if [[ "$ANZAHL" -lt 5 ]]; then
  echo "Die Sicherung sieht leer aus ($ANZAHL Eintraege). Abbruch." >&2
  rm -f "$DATEI"
  exit 1
fi

GROESSE="$(du -h "$DATEI" | cut -f1)"
echo "Fertig: $GROESSE, $ANZAHL Eintraege im Inhaltsverzeichnis."

# Alte Sicherungen aufraeumen. Ohne das laeuft irgendwann die Platte voll,
# und eine volle Platte legt die Datenbank lahm.
GELOESCHT="$(find "$ZIEL" -name 'dels_*.dump' -type f -mtime "+$BEHALTEN_TAGE" -print -delete | wc -l)"
if [[ "$GELOESCHT" -gt 0 ]]; then
  echo "$GELOESCHT Sicherung(en) aelter als $BEHALTEN_TAGE Tage entfernt."
fi

VORHANDEN="$(find "$ZIEL" -name 'dels_*.dump' -type f | wc -l)"
echo "Im Ordner liegen jetzt $VORHANDEN Sicherung(en)."
