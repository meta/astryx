#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file serve.mjs
 * @input `--port <n>` (default 4179) and the built Sandbox in apps/sandbox/out
 * @output A read-only static server over the built Sandbox: a trailing-slash
 *   route serves its directory's index.html, as the deployed Sandbox does
 * @position playwright.perf.config.ts's web server. `vite preview` would load
 *   the Sandbox's Vite config, which needs the generated registries the build
 *   writes; the measure job has only the built output.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../out',
);
const portIndex = process.argv.indexOf('--port');
const PORT = portIndex === -1 ? 4179 : Number(process.argv[portIndex + 1]);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(
    `No built Sandbox at ${ROOT}. Run \`pnpm build && pnpm -F @astryxdesign/sandbox build\` first.`,
  );
  process.exit(1);
}

http
  .createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url ?? '/', 'http://localhost').pathname,
    );
    let file = path.resolve(ROOT, `.${pathname}`);
    // Never serve outside the build, whatever the URL asks for.
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      response.writeHead(404).end('not found');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type':
        CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(response);
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`Serving ${ROOT} on http://127.0.0.1:${PORT}`);
  });
