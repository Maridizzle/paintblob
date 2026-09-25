#!/usr/bin/env node
// Runs the pack maker locally.
//
//   npm run pack-maker      # then open the printed http://localhost URL
//
// It serves tools/pack-maker.html and the src/ pipeline from a localhost server
// only so the page's ES modules resolve — no image ever leaves your machine, the
// page does all its work in the browser. This tool lives under tools/, which the
// web build (tools/build-web.mjs copies only src/ and puzzles/) never ships, so
// it can never appear on the public site.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 4321;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

const PAGE = '/tools/pack-maker.html';

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  // Redirect root to the page's real path so its relative module imports
  // (./lib/…, ../src/…) resolve against tools/, not the server root.
  if (urlPath === '/') { res.writeHead(302, { location: PAGE }); res.end(); return; }
  const filePath = path.normalize(path.join(ROOT, urlPath));
  // Never serve outside the repo.
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  process.stdout.write(
    `\n  pack maker running — open this in your browser:\n\n`
    + `    http://localhost:${PORT}/\n\n`
    + `  Drop images, name the pack, download the .zip, then unzip the folder\n`
    + `  into paintblob-cloud/packs/ and push. Everything runs on this machine.\n`
    + `  Nothing is uploaded. Press Ctrl-C to stop.\n\n`,
  );
});
