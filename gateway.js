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

// Start API (Runs on port 3001)
const api = spawn('pnpm', ['--filter', '@qanoai/api', 'start'], { env: { ...childEnv, PORT: 3001 }, stdio: 'inherit' });

// Start Realtime (Runs on port 3002)
const realtime = spawn('pnpm', ['--filter', '@qanoai/realtime', 'start'], { env: { ...childEnv, PORT: 3002 }, stdio: 'inherit' });

// Start Worker (No port)
const worker = spawn('pnpm', ['--filter', '@qanoai/worker', 'start'], { env: childEnv, stdio: 'inherit' });

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

// Proxy /socket.io to Realtime server
app.use('/socket.io', createProxyMiddleware({ 
  target: 'http://localhost:3002', 
  ws: true,
  changeOrigin: true
}));

// Proxy everything else to API server
app.use('/', createProxyMiddleware({ 
  target: 'http://localhost:3001',
  changeOrigin: true
}));

app.listen(PORT, () => {
  console.log(`Gateway listening on port ${PORT}`);
});
