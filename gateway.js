const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;

console.log('Starting QanoAI Monolithic Backend...');

// Start Redis Server locally inside the container
const redis = spawn('redis-server', ['--daemonize', 'yes']);
redis.on('close', (code) => {
    console.log(`Redis exited with code ${code}`);
});

// Environment for the children
const childEnv = { 
  ...process.env, 
  REDIS_URL: 'redis://localhost:6379'
};

// Start API (Runs on port 3001)
const api = spawn('pnpm', ['--filter', 'api', 'start'], { env: { ...childEnv, PORT: 3001 }, stdio: 'inherit' });

// Start Realtime (Runs on port 3002)
const realtime = spawn('pnpm', ['--filter', 'realtime', 'start'], { env: { ...childEnv, PORT: 3002 }, stdio: 'inherit' });

// Start Worker (No port)
const worker = spawn('pnpm', ['--filter', 'worker', 'start'], { env: childEnv, stdio: 'inherit' });

// Setup Gateway Proxy
const app = express();

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
