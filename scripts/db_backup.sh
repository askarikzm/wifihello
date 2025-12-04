#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")
FILE="${BACKUP_DIR}/netaxis_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
pg_dump --dbname="${DATABASE_URL}" | gzip > "${FILE}"
echo "Database backup stored at ${FILE}"
