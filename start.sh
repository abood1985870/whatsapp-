#!/bin/bash
set -e

export PORT=${PORT:-3000}

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

# Redis is genuinely optional — REDIS_DISABLED exists precisely so the platform
# can run without it. Demanding REDIS_URL unconditionally meant the documented
# way to run without Redis could not start at all.
if [ "$REDIS_DISABLED" != "true" ] && [ -z "$REDIS_URL" ]; then
  echo "REDIS_URL is required (or set REDIS_DISABLED=true to run without it)"
  exit 1
fi

echo "Deploying database..."
pnpm --filter database db:deploy || pnpm --filter database db:push

echo "Starting Node.js Gateway..."
node gateway.js
