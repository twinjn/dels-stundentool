#!/bin/sh
#
# Laeuft als eigener Container und sichert einmal am Tag.
#
# Bewusst eine simple Schleife statt cron: ein Container mit cron braucht
# einen zweiten Prozess, eigene Logausgabe und eigene Fehlersuche. Diese
# Schleife schreibt alles ins Containerlog, wo man es ohnehin sucht.
set -eu

STUNDE="${BACKUP_STUNDE:-2}"
echo "Sicherungsdienst gestartet. Taeglich um ${STUNDE}:00 Uhr."

while true; do
  JETZT="$(date +%H)"
  if [ "$JETZT" = "$(printf '%02d' "$STUNDE")" ]; then
    echo "--- $(date '+%Y-%m-%d %H:%M:%S') Sicherung beginnt ---"

    if /infra/backup.sh /backups; then
      # Die frische Sicherung gleich pruefen, indem sie in eine
      # Wegwerf-Datenbank zurueckgespielt wird.
      if /infra/backup-pruefen.sh; then
        echo "Sicherung geprueft und in Ordnung."
      else
        echo "ACHTUNG: die Sicherung liess sich nicht zurueckspielen." >&2
      fi
    else
      echo "ACHTUNG: die Sicherung ist fehlgeschlagen." >&2
    fi

    # Eine Stunde schlafen, damit dieselbe Stunde nicht mehrfach greift.
    sleep 3600
  fi
  sleep 300
done
