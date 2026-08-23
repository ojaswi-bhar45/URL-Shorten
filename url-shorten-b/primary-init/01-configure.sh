#!/bin/bash
set -e

cp /docker-entrypoint-initdb.d/pg_hba.conf /var/lib/postgresql/data/pg_hba.conf
chown postgres:postgres /var/lib/postgresql/data/pg_hba.conf
chmod 600 /var/lib/postgresql/data/pg_hba.conf