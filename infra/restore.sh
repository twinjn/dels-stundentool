#!/usr/bin/env bash
#
# Spielt eine Sicherung zurueck.
#
#   infra/restore.sh <sicherung.dump> <ziel-datenbank-url>
#
# Beispiel fuer einen Probelauf in eine Wegwerf-Datenbank:
#   infra/restore.sh backups/dels_2026-09-21_120000.dump \
#       postgres://dels:passwort@localhost:5432/dels_probe
#
# ACHTUNG: die Zieldatenbank wird geleert. Deshalb muss sie ausdruecklich
# angegeben werden, es gibt keinen Standardwert. Wer sich hier vertippt,
# soll nicht aus Versehen die Produktivdatenbank treffen.
set -euo pipefail

DATEI="${1:-}"
ZIEL_URL="${2:-}"

if [[ -z "$DATEI" || -z "$ZIEL_URL" ]]; then
  echo "Aufruf: infra/restore.sh <sicherung.dump> <ziel-datenbank-url>" >&2
  exit 1
fi

if [[ ! -f "$DATEI" ]]; then
  echo "Datei nicht gefunden: $DATEI" >&2
  exit 1
fi

echo "Spiele $DATEI nach $(echo "$ZIEL_URL" | sed 's|://[^@]*@|://***@|') ein ..."

# --clean --if-exists raeumt vorhandene Tabellen weg, bevor es einspielt.
# Ohne das schlaegt der Lauf an jedem schon vorhandenen Objekt fehl.
# --exit-on-error: lieber laut scheitern als halb zurueckgespielt.
pg_restore \
  --dbname="$ZIEL_URL" \
  --clean --if-exists \
  --no-owner --no-privileges \
  --exit-on-error \
  "$DATEI"

echo "Eingespielt."
