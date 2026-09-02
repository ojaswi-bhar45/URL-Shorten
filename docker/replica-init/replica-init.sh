#!/bin/bash
set -e

: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD must be set}"

DATA_DIR="/var/lib/postgresql/data"

prepare_dir() {
  # Clear contents but keep the mount point itself
  find "$DATA_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  mkdir -p "$DATA_DIR"
  chown postgres:postgres "$DATA_DIR"
}

if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
  echo "Bootstrapping replica from postgres-primary..."
  prepare_dir

  until PGPASSWORD="$REPLICATION_PASSWORD" gosu postgres pg_basebackup \
      --host=postgres-primary \
      --port=5432 \
      --username=replicator \
      --pgdata="$DATA_DIR" \
      --wal-method=stream \
      --write-recovery-conf \
      --checkpoint=fast; do
    echo "pg_basebackup failed - cleaning up and retrying in 3s..."
    prepare_dir
    sleep 3
  done

  echo "Base backup complete - replica is ready to start as standby"
else
  echo "Existing replica data found - skipping bootstrap"
fi

exec docker-entrypoint.sh postgres -c hot_standby=on
