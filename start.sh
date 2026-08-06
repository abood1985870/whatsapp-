#!/bin/bash
set -e

echo "Starting Redis..."
redis-server --daemonize yes

echo "Deploying database..."
pnpm --filter database db:deploy || pnpm --filter database db:push

echo "Starting Node.js Gateway..."
export REDIS_URL="redis://localhost:6379"
export PORT=${PORT:-3000}
node gateway.js
