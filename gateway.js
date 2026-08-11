const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;

console.log('Starting QanoAI Monolithic Backend...');

// Environment for the children
const childEnv = { 
  ...process.env
};
const isWorkerDisabled = process.env.DISABLE_BACKGROUND_WORKER === 'true';

/**
 * Bring the whole container down when any child dies.
 *
 * Without this the gateway kept listening and the platform's health check kept
 * passing after the API, realtime server or worker had exited — so a crashed
 * API looked healthy from outside while every request 502'd, and a crashed
 * worker meant campaigns silently stopped being dispatched with nothing to
 * indicate it. Exiting lets the platform restart the container, which is the
 * behaviour that was assumed all along.
 */
function superviseChild(name, child, { required = true } = {}) {
  child.on('error', (err) => {
    console.error(`[gateway] failed to start ${name}:`, err);
    if (required) process.exit(1);
  });
  child.on('exit', (code, signal) => {
    console.error(`[gateway] ${name} exited (code=${code} signal=${signal ?? 'none'}) - shutting down`);
    if (required) process.exit(typeof code === 'number' ? code || 1 : 1);
  });
  return child;
}

// Start API (Runs on port 3001)
const api = superviseChild(
  'api',
  spawn('pnpm', ['--filter', '@qanoai/api', 'start'], { env: { ...childEnv, PORT: 3001 }, stdio: 'inherit' })
);

// Start Realtime (Runs on port 3002)
const realtime = superviseChild(
  'realtime',
  spawn('pnpm', ['--filter', '@qanoai/realtime', 'start'], { env: { ...childEnv, PORT: 3002 }, stdio: 'inherit' })
);

// Start Worker (No port)
if (isWorkerDisabled) {
  console.log('Background worker disabled by DISABLE_BACKGROUND_WORKER=true');
} else {
  superviseChild(
    'worker',
    spawn('pnpm', ['--filter', '@qanoai/worker', 'start'], { env: childEnv, stdio: 'inherit' })
  );
}

// Setup Gateway Proxy
const app = express();

function getAllowedOrigins() {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  }
  return process.env.APP_URL ? [process.env.APP_URL] : [];
}

const allowedOrigins = getAllowedOrigins();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

// `xfwd` makes the proxy send X-Forwarded-For/-Proto/-Host. Without it every
// request reached the API from 127.0.0.1, so per-IP rate limiting counted the
// whole internet as one client and audit rows recorded the gateway's own
// address instead of the caller's.
const forwardOpts = { changeOrigin: true, xfwd: true };

// Proxy /socket.io to Realtime server
app.use('/socket.io', createProxyMiddleware({
  target: 'http://localhost:3002',
  ws: true,
  ...forwardOpts
}));

// Voice media stream needs a WebSocket upgrade to the API, which the
// catch-all proxy below does not perform. Registered first so the more
// specific path wins.
app.use('/v1/voice/media-stream', createProxyMiddleware({
  target: 'http://localhost:3001',
  ws: true,
  ...forwardOpts
}));

// Proxy everything else to API server
app.use('/', createProxyMiddleware({
  target: 'http://localhost:3001',
  ...forwardOpts
}));

app.listen(PORT, () => {
  console.log(`Gateway listening on port ${PORT}`);
});
