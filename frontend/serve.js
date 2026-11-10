import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Proxy /api/* to C# General Backend
  if (pathname.startsWith('/api/')) {
    const targetUrl = `${BACKEND_URL}${req.url}`;
    const proxyReq = http.request(
      targetUrl,
      {
        method: req.method,
        headers: { ...req.headers, host: new URL(BACKEND_URL).host },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to connect to C# General Backend', details: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Serve static files
  let filePath = path.join(process.cwd(), 'frontend', pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(process.cwd(), 'frontend', 'index.html');
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Frontend running on http://localhost:${PORT} (proxying /api to ${BACKEND_URL})`);
});
