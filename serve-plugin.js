// Tiny static file server for the built RemNote plugin (dist/).
//
// RemNote's "Develop from localhost" loads the plugin from http://localhost:8080.
// This serves the already-built dist/ folder with the CORS header RemNote needs,
// so the plugin stays available without running the heavy webpack dev server.
// It is started automatically at login by a launchd agent (see
// ~/Library/LaunchAgents/com.limmxc1.remnote-flashcard-plugin.plist).

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = path.join(__dirname, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // CORS headers RemNote requires (mirrors webpack.config.js devServer.headers).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'baggage, sentry-trace');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Map the URL to a file inside dist/, blocking directory traversal.
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`RemNote plugin served at http://localhost:${PORT} from ${ROOT}`);
});
