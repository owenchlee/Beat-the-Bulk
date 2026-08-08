#!/usr/bin/env node
// Zero-dependency static file server for Beat the Bulk.
// Usage: node serve.js [port]  (default port 8000, falls forward if taken)
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const startPort = Number(process.argv[2]) || 8000;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/workout_buddy.html';
  const filePath = path.join(root, reqPath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + reqPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

let currentPort = startPort;

function listen(port) {
  currentPort = port;
  server.listen(port, () => {
    console.log(`Serving ${root} at http://localhost:${port}/`);
    console.log(`  Blobby Fit:     http://localhost:${port}/blobby_fit.html`);
    console.log(`  Workout Buddy:  http://localhost:${port}/workout_buddy.html`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && currentPort < startPort + 10) {
    listen(currentPort + 1);
  } else {
    console.error(err.message);
    process.exit(1);
  }
});

listen(startPort);
