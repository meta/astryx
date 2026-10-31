// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file storybook.ts
 * @input Uses node:http, node:fs, node:path
 * @output `serveStorybook` — a read-only static server over a built Storybook,
 *   for the Chromium lane to drive stories from — and `serveStatic`, the same
 *   server over any built site (the Sandbox, for the perf scenes).
 * @position Binding infrastructure for the Playwright specs. Not part of the
 *   contract: it decides nothing about accessibility, it just puts checked-in
 *   stories in front of a real browser.
 *
 * Stories are the reproduction path on purpose. `docs/specs/AST-009/spec.md`
 * FR30 asks that a scenario used for verification be checked in rather than
 * living in a one-off page, and every other Chromium check in this repository
 * already reads the same built Storybook.
 *
 * SYNC: The default directory matches the `storybook-<sha>` CI artifact path
 *   used by the accessibility job in .github/workflows/ci.yml.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const DEFAULT_STORYBOOK_DIR = 'apps/storybook/dist';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
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

export interface StaticServer {
  /** Origin to fetch from, e.g. `http://127.0.0.1:53312`. */
  readonly origin: string;
  close(): Promise<void>;
}

export async function serveStorybook(
  directory = DEFAULT_STORYBOOK_DIR,
): Promise<StaticServer> {
  return serveStatic(directory, {
    sentinel: 'iframe.html',
    missing: root =>
      `No built Storybook at ${root}. Run \`pnpm storybook:build\` first, or point ASTRYX_STORYBOOK_DIR at a build.`,
  });
}

export interface ServeStaticOptions {
  /** A file the build always has; its absence means there is no build. */
  readonly sentinel: string;
  /** The error message when the sentinel is missing. */
  readonly missing: (root: string) => string;
}

/**
 * Serves a built site read-only on a free local port. A directory serves its
 * `index.html`, so trailing-slash routes resolve as a static host serves them.
 */
export async function serveStatic(
  directory: string,
  {sentinel, missing}: ServeStaticOptions,
): Promise<StaticServer> {
  const root = path.resolve(directory);
  if (!fs.existsSync(path.join(root, sentinel))) {
    throw new Error(missing(root));
  }

  const server = http.createServer((request, response) => {
    const requested = (request.url ?? '/').split('?')[0] ?? '/';
    let resolved = path.resolve(
      root,
      `.${requested === '/' ? '/index.html' : requested}`,
    );
    // Never serve outside the build, whatever the URL asks for.
    // The separator matters: a bare prefix test would also admit a sibling
    // directory whose name merely starts with the root's.
    const inside = resolved === root || resolved.startsWith(root + path.sep);
    if (
      inside &&
      fs.existsSync(resolved) &&
      fs.statSync(resolved).isDirectory()
    ) {
      resolved = path.join(resolved, 'index.html');
    }
    if (!inside || !fs.existsSync(resolved)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type':
        CONTENT_TYPES[path.extname(resolved)] ?? 'application/octet-stream',
    });
    fs.createReadStream(resolved).pipe(response);
  });

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('the static server did not report a port');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error == null ? resolve() : reject(error)));
      }),
  };
}
