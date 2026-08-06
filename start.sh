#!/bin/bash
set -e

echo "Starting Redis..."
redis-server --daemonize yes

echo "Initializing and starting PostgreSQL..."
export PGDATA=/app/pgdata
mkdir -p $PGDATA

# Find postgres binaries (Debian/Ubuntu usually puts them in /usr/lib/postgresql/X/bin)
PG_BIN_DIR=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -n 1)
export PATH="$PG_BIN_DIR:$PATH"

# Initialize DB if not exists
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  initdb -D $PGDATA
fi

# Start Postgres in background
pg_ctl -D $PGDATA -l /app/pg.log start -o "-p 5432"

# Wait for Postgres to be ready
until pg_isready; do
  echo "Waiting for Postgres..."
  sleep 1
done

# Create DB (ignore if exists)
createdb railway || true
psql -c "ALTER USER $(whoami) WITH PASSWORD 'postgres';" || true

echo "Postgres ready!"

export DATABASE_URL="postgresql://$(whoami):postgres@localhost:5432/railway?schema=public"
export REDIS_URL="redis://localhost:6379"
export PORT=${PORT:-3000}

echo "Deploying database..."
pnpm --filter database db:deploy || pnpm --filter database db:push

echo "Starting Node.js Gateway..."
node gateway.js
