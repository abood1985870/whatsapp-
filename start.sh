#!/bin/bash
set -e

export PORT=${PORT:-3000}

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if [ -z "$REDIS_URL" ]; then
  echo "REDIS_URL is required"
  exit 1
fi

echo "Deploying database..."
pnpm --filter database db:deploy || pnpm --filter database db:push

echo "Starting Node.js Gateway..."
node gateway.js
