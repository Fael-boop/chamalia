#!/bin/sh
# Runs on the VPS (copy to the server and run with: sh /tmp/restore-test.sh; do not feed it through ssh stdin, docker exec -i would swallow it).
# Restores the newest backup into a throwaway database and compares row counts.
set -eu
PG=$(docker ps -q -f name=chamalia_postgres | head -n 1)
FILE=$(ls -1t /root/backups/daily/chamalia-*.sql.gz | head -n 1)
q() { docker exec -i "$PG" psql -q -At -U chamalia -v ON_ERROR_STOP=1 "$@"; }

echo "restaurando $(basename "$FILE") em um banco temporario"
q -d postgres -c "drop database if exists restore_test" -c "create database restore_test"
gunzip -c "$FILE" | q -d restore_test > /dev/null

for T in tenants appointments customers payments plans services professionals; do
  A=$(q -d chamalia -c "select count(*) from $T")
  B=$(q -d restore_test -c "select count(*) from $T")
  [ "$A" = "$B" ] && R="igual" || R="DIFERENTE"
  echo "$T: producao $A | restaurado $B | $R"
done
q -d postgres -c "drop database restore_test"
echo "banco temporario removido"
