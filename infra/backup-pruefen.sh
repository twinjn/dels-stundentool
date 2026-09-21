#!/usr/bin/env bash
#
# Prueft eine Sicherung, indem sie wirklich zurueckgespielt wird.
#
#   infra/backup-pruefen.sh [sicherung.dump]
#
# Ohne Angabe wird die neueste Sicherung genommen.
#
# WARUM DAS SKRIPT EXISTIERT:
# Eine Sicherung, die nie zurueckgespielt wurde, ist keine Sicherung,
# sondern eine Hoffnung. Die haeufigsten Ueberraschungen sind eine
# abgebrochene Datei, eine falsche Postgres-Version und Rechte, die beim
# Einspielen fehlen. Alle drei fallen hier auf, in einer Wegwerf-Datenbank,
# und nicht am Tag, an dem es darauf ankommt.
#
# Verglichen werden die Zeilenzahlen aller Tabellen. Stimmen sie nicht
# ueberein, scheitert das Skript.
set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROBE_DB="${PROBE_DATENBANK:-dels_restore_probe}"

if [[ -z "${DATABASE_URL:-}" && -f "$WURZEL/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$WURZEL/.env" | head -1 | cut -d= -f2-)"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL fehlt." >&2
  exit 1
fi

DATEI="${1:-$(find "$WURZEL/backups" -name 'dels_*.dump' -type f 2>/dev/null | sort | tail -1)}"
if [[ -z "$DATEI" || ! -f "$DATEI" ]]; then
  echo "Keine Sicherung gefunden. Zuerst infra/backup.sh ausfuehren." >&2
  exit 1
fi

# Die Adresse der Probedatenbank aus der echten ableiten: alles gleich,
# nur der Datenbankname am Ende wird ersetzt.
PROBE_URL="$(echo "$DATABASE_URL" | sed -E "s|/[^/?]+(\?.*)?$|/$PROBE_DB\1|")"
VERWALTUNG_URL="$(echo "$DATABASE_URL" | sed -E "s|/[^/?]+(\?.*)?$|/postgres\1|")"

echo "Pruefe $DATEI"
echo "Probedatenbank: $PROBE_DB"

aufraeumen() {
  psql "$VERWALTUNG_URL" -q -c "drop database if exists \"$PROBE_DB\";" >/dev/null 2>&1 || true
}
trap aufraeumen EXIT

aufraeumen
psql "$VERWALTUNG_URL" -q -c "create database \"$PROBE_DB\";"

pg_restore --dbname="$PROBE_URL" --no-owner --no-privileges --exit-on-error "$DATEI"

# Zeilenzahlen beider Datenbanken vergleichen.
zaehle() {
  psql "$1" -At -F'|' -c "
    select relname, n_live_tup
    from pg_stat_user_tables
    where schemaname = 'public'
    order by relname;" 2>/dev/null
}

# n_live_tup ist eine Schaetzung, deshalb zaehlen wir hier wirklich nach.
zaehle_genau() {
  local url="$1"
  local tabellen
  tabellen="$(psql "$url" -At -c "
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '__drizzle_migrations'
    order by tablename;")"
  for tabelle in $tabellen; do
    local anzahl
    anzahl="$(psql "$url" -At -c "select count(*) from \"$tabelle\";")"
    echo "$tabelle|$anzahl"
  done
}

ORIGINAL="$(zaehle_genau "$DATABASE_URL")"
WIEDERHERGESTELLT="$(zaehle_genau "$PROBE_URL")"

echo
printf '%-24s %10s %10s\n' "Tabelle" "Original" "Kopie"
printf '%-24s %10s %10s\n' "-----------------------" "--------" "--------"

ABWEICHUNG=0
while IFS='|' read -r tabelle anzahl; do
  [[ -z "$tabelle" ]] && continue
  kopie="$(echo "$WIEDERHERGESTELLT" | grep "^$tabelle|" | cut -d'|' -f2 || true)"
  kopie="${kopie:-fehlt}"
  printf '%-24s %10s %10s' "$tabelle" "$anzahl" "$kopie"
  if [[ "$kopie" != "$anzahl" ]]; then
    printf '   <-- WEICHT AB'
    ABWEICHUNG=1
  fi
  printf '\n'
done <<< "$ORIGINAL"

echo
if [[ "$ABWEICHUNG" -ne 0 ]]; then
  echo "PRUEFUNG FEHLGESCHLAGEN: die Kopie stimmt nicht mit dem Original ueberein." >&2
  exit 1
fi

echo "Pruefung bestanden: alle Tabellen vollstaendig zurueckgespielt."
