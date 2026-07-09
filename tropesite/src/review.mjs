// Local preview server for the built site. Zero deps (node:http). Renders
// drafts locally so nothing deploys unapproved.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };

export function review({ port = 4321 } = {}) {
  if (!fs.existsSync(config.distDir)) {
    console.error('Nothing to preview. Run `tropesite build` first.');
    process.exitCode = 1;
    return;
  }
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(config.distDir, urlPath);
    if (urlPath.endsWith('/')) file = path.join(file, 'index.html');
    else if (!path.extname(file)) file = path.join(file, 'index.html');
    if (!file.startsWith(config.distDir)) { res.writeHead(403).end('forbidden'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>404</h1><p><a href="/">home</a></p>'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  });
  server.listen(port, () => {
    console.log(`\ntropesite review server → http://localhost:${port}/`);
    console.log(`Serving ${path.relative(config.root, config.distDir)}/  (Ctrl-C to stop)\n`);
  });
}
