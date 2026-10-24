#!/bin/sh
# Daily backup of the Chama Lia databases on the VPS (Postgres of the Easypanel project "chamalia").
# Installed at /usr/local/bin/chamalia-backup.sh and run by /etc/cron.d/chamalia-backup.
#   chamalia  = the business data (agenda, customers, plans, payments)
#   evolution = the WhatsApp connection (the chip's session)
# Keeps the last 7 days. It only deletes its own files, in its own folder.
set -eu

DIR=/root/backups/daily
KEEP_DAYS=7
STAMP=$(date +%Y-%m-%d_%H%M)
PG=$(docker ps -q -f name=chamalia_postgres | head -n 1)

[ -n "$PG" ] || { echo "$(date -Is) ERRO: container do postgres nao encontrado"; exit 1; }
mkdir -p "$DIR"
chmod 700 "$DIR"

for DB in chamalia evolution; do
  OUT="$DIR/$DB-$STAMP.sql.gz"
  # Written to a temporary name first: a failed dump never looks like a good backup.
  if docker exec "$PG" pg_dump -U chamalia --no-owner "$DB" | gzip > "$OUT.tmp" && [ "$(wc -c < "$OUT.tmp")" -gt 500 ]; then
    mv "$OUT.tmp" "$OUT"
    chmod 600 "$OUT"
    echo "$(date -Is) ok $DB $(wc -c < "$OUT") bytes"
  else
    rm -f "$OUT.tmp"
    echo "$(date -Is) ERRO: backup de $DB falhou"
    exit 1
  fi
done

find "$DIR" -maxdepth 1 -type f \( -name 'chamalia-*.sql.gz' -o -name 'evolution-*.sql.gz' \) -mtime +"$KEEP_DAYS" -delete
