// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rtl-audit-server.mjs
 * @input A built Storybook folder
 * @output serve, the RTL audit's static file server, and cacheControlFor, the
 *   caching each response carries
 * @position Used by rtl-audit.mjs, which points every worker page at it.
 *
 * Vite names every built asset under `assets/` by a hash of its contents, so a
 * page may keep it: each worker's pages then fetch and compile the preview
 * bundle (`assets/iframe-*.js`, over 2 MB, with its preloaded chunks) once,
 * not on every story navigation. Everything else, `iframe.html` and
 * `index.json` included, is revalidated on each load, so a changed build is
 * always read.
 *
 * SYNC: When modified, update .github/scripts/rtl-audit-server.test.mjs.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
};

/**
 * The Cache-Control a response for `urlPath` carries: content-hashed assets
 * are kept for good; anything else is checked again on every load.
 * @param {string} urlPath the request's path, without its query
 * @returns {string}
 */
export function cacheControlFor(urlPath) {
  return urlPath.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

/**
 * Serves `root` on a free local port.
 * @param {string} root the built Storybook folder
 * @returns {Promise<{server: http.Server, port: number}>}
 */
export function serve(root) {
  const base = path.resolve(root);
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let u = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (u === '/') u = '/index.html';
      const fp = path.resolve(path.join(base, u));
      if (!fp.startsWith(base)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(fp, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
          'Cache-Control': cacheControlFor(u),
        });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () =>
      resolve({
        server,
        port: /** @type {{port: number}} */ (server.address()).port,
      }),
    );
  });
}
