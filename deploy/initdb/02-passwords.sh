#!/bin/sh
# Roda na primeira subida do volume, depois de roles.sql: troca as senhas de
# desenvolvimento pelas do .env.prod.
set -eu

psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -v owner_pw="$POS_OWNER_PASSWORD" -v app_pw="$POS_APP_PASSWORD" <<'SQL'
alter role pos_owner password :'owner_pw';
alter role pos_app password :'app_pw';
SQL
