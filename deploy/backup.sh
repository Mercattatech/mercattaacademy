#!/usr/bin/env bash
# Backup diário na VPS: dump do Postgres + espelho dos arquivos do MinIO.
# Agende no cron (como o usuário que roda o Docker), por exemplo às 03:30:
#   30 3 * * * /opt/pos-saas/deploy/backup.sh >> /var/log/pos-saas-backup.log 2>&1
#
# Variáveis opcionais: BACKUP_DIR (padrão /var/backups/pos-saas), KEEP_DAYS (padrão 14).
# IMPORTANTE: isto guarda cópias NA PRÓPRIA VPS. Copie BACKUP_DIR para outro lugar
# (outro servidor, bucket externo) com rclone/rsync, senão um defeito do disco leva tudo.
set -euo pipefail

cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pos-saas}"
KEEP_DAYS="${KEEP_DAYS:-14}"
ENV_FILE="${ENV_FILE:-.env.prod}"          # na VPS completa: ENV_FILE=.env.vps
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"  # na VPS completa: COMPOSE_FILE=docker-compose.vps.yml
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
STAMP="$(date +%Y%m%d-%H%M%S)"

set -a; . "./$ENV_FILE"; set +a
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/files"

echo "[$(date -Is)] dump do banco"
OUT="$BACKUP_DIR/db/pos_saas-$STAMP.dump"
"${COMPOSE[@]}" exec -T postgres pg_dump -U postgres -Fc pos_saas > "$OUT.tmp"
# Um dump vazio ou truncado não pode virar "backup bom".
"${COMPOSE[@]}" exec -T postgres pg_restore -l < "$OUT.tmp" > /dev/null
mv "$OUT.tmp" "$OUT"

echo "[$(date -Is)] espelho dos arquivos"
NETWORK="$("${COMPOSE[@]}" ps -q minio | xargs docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')"
docker run --rm --network "$NETWORK" -v "$BACKUP_DIR/files:/dest" --entrypoint sh minio/mc -c \
  "mc alias set l http://minio:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' >/dev/null && mc mirror --overwrite --remove l/pos-saas /dest"

echo "[$(date -Is)] limpando dumps com mais de $KEEP_DAYS dias"
find "$BACKUP_DIR/db" -name 'pos_saas-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "[$(date -Is)] ok: $OUT ($(du -h "$OUT" | cut -f1))"
