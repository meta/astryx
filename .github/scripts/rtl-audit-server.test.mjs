// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The RTL audit's static server lets a page keep Storybook's
 * content-hashed assets and revalidates everything else, so a worker page
 * fetches and compiles the preview bundle once rather than on every story
 * navigation; it still refuses paths outside the build and answers 404 for
 * missing files.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  cacheControlFor,
  serve,
} from '../../apps/storybook/rtl-audit/rtl-audit-server.mjs';

/** @type {string} */
let root;
/** @type {import('node:http').Server} */
let server;
/** @type {string} */
let origin;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-audit-server-'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'iframe-BGZv6yIu.js'), 'x');
  fs.writeFileSync(path.join(root, 'iframe.html'), '<!doctype html>');
  fs.writeFileSync(path.join(root, 'index.json'), '{}');
  fs.writeFileSync(path.join(os.tmpdir(), 'rtl-audit-server-outside.txt'), '');
  const started = await serve(root);
  server = started.server;
  origin = `http://127.0.0.1:${started.port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(root, {recursive: true, force: true});
});

describe('the RTL audit server', () => {
  it('lets a page keep content-hashed assets and revalidates the rest', () => {
    expect(cacheControlFor('/assets/iframe-BGZv6yIu.js')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(cacheControlFor('/iframe.html')).toBe('no-cache');
    expect(cacheControlFor('/index.json')).toBe('no-cache');
  });

  it('serves each response with its caching and type', async () => {
    const asset = await fetch(`${origin}/assets/iframe-BGZv6yIu.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(asset.headers.get('content-type')).toBe('text/javascript');
    const page = await fetch(`${origin}/iframe.html?id=core-button--default`);
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(page.headers.get('content-type')).toBe('text/html');
  });

  it('refuses a path outside the build and answers 404 for a missing file', async () => {
    const outside = await fetch(`${origin}/..%2Frtl-audit-server-outside.txt`);
    expect(outside.status).toBe(403);
    const missing = await fetch(`${origin}/assets/none.js`);
    expect(missing.status).toBe(404);
  });
});
