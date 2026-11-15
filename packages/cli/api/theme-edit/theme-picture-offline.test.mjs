// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A picture never waits on a network: the picture's browser loads
 * the page's own files only, so a remote stylesheet, font or image the page
 * names (a base theme's Google Fonts import, a template's photo) fails at
 * once. Measured against a server that takes every connection and never
 * answers, as a network that is not there does.
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {screenshot} from './_preview.mjs';
import {
  LOCAL_URL,
  QUIET_BROWSER_ARGS,
} from '../../foundation/render/offline.mjs';

/** A Chrome on this machine, for the test that needs a real one. */
const chrome = (process.env.PATH ?? '')
  .split(path.delimiter)
  .flatMap(d =>
    ['google-chrome', 'chromium', 'chromium-browser', 'chrome'].map(n =>
      path.join(d, n),
    ),
  )
  .find(f => {
    try {
      fs.accessSync(f, fs.constants.X_OK);
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  });

/** Connections the silent server took. */
let connections = 0;
/** @type {net.Server} */
let server;
/** @type {number} */
let port;
beforeAll(async () => {
  // Takes a connection and never answers: a request to it would hold the
  // page's load until the browser gave up.
  server = net.createServer(() => {
    connections += 1;
  });
  await new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(null)),
  );
  port = /** @type {net.AddressInfo} */ (server.address()).port;
});
afterAll(() => {
  server.closeAllConnections?.();
  server.close();
});

/** A page naming remote files every way a page can. */
const page = () => {
  const remote = `http://127.0.0.1:${port}`;
  return `<html><head>
<link rel="stylesheet" href="${remote}/fonts.css">
<style>@import url('${remote}/import.css');
@font-face{font-family:Far;src:url('${remote}/far.woff2')}
body{font-family:Far,sans-serif;margin:0}</style>
</head><body><img src="${remote}/photo.jpg" width="10" height="10"><p>text</p></body></html>`;
};

describe('a picture never waits on a network', () => {
  it('the rule loads only the page and inline data', () => {
    for (const u of [
      'file:///a/p.html',
      'data:image/png;base64,AA==',
      'about:blank',
    ])
      expect(LOCAL_URL.test(u)).toBe(true);
    for (const u of [
      'https://fonts.googleapis.com/css2?family=Figtree',
      'http://127.0.0.1:1/x.css',
      'wss://h/x',
    ])
      expect(LOCAL_URL.test(u)).toBe(false);
  });

  it.skipIf(!chrome)(
    'a Chrome takes the picture at once, asking the network for nothing',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-offline-'));
      try {
        const html = path.join(dir, 'p.html');
        fs.writeFileSync(html, page());
        const png = path.join(dir, 'p.png');
        const started = Date.now();
        // A proxy that is the silent server: a request the browser makes
        // of its own (an update or time check) would reach it.
        const saved = {
          http: process.env.http_proxy,
          https: process.env.https_proxy,
        };
        process.env.http_proxy = `http://127.0.0.1:${port}`;
        process.env.https_proxy = `http://127.0.0.1:${port}`;
        /** @type {Awaited<ReturnType<typeof screenshot>>} */
        let r;
        try {
          r = await screenshot(
            {cwd: dir, req: createRequire(path.join(dir, 'package.json'))},
            html,
            png,
            'light',
          );
        } finally {
          for (const [k, v] of /** @type {const} */ ([
            ['http_proxy', saved.http],
            ['https_proxy', saved.https],
          ]))
            if (v == null) delete process.env[k];
            else process.env[k] = v;
        }
        expect(r.ok).toBe(true);
        expect(fs.existsSync(png)).toBe(true);
        // Far inside the run's time limit, which a waited-on request reaches.
        expect(Date.now() - started).toBeLessThan(30_000);
        // No connection at all: neither the page's nor the browser's own.
        expect(connections).toBe(0);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    90_000,
  );

  it('a Chrome is started with its own network off', async () => {
    for (const flag of [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-first-run',
      '--disable-default-apps',
      '--metrics-recording-only',
      '--no-proxy-server',
      '--host-resolver-rules=MAP * ~NOTFOUND',
    ])
      expect(QUIET_BROWSER_ARGS).toContain(flag);
    // A stand-in Chrome on PATH that records the flags it was started with.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-quiet-'));
    const savedPath = process.env.PATH;
    try {
      const bin = path.join(dir, 'bin');
      fs.mkdirSync(bin);
      const argsFile = path.join(dir, 'args.txt');
      fs.writeFileSync(
        path.join(bin, 'chromium'),
        `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > ${JSON.stringify(argsFile)}\nexit 1\n`,
        {mode: 0o755},
      );
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      const html = path.join(dir, 'p.html');
      fs.writeFileSync(html, '<p>x</p>');
      process.env.PATH = `${bin}${path.delimiter}${path.dirname(process.execPath)}`;
      await screenshot(
        {cwd: dir, req: createRequire(path.join(dir, 'package.json'))},
        html,
        path.join(dir, 'p.png'),
        'light',
      );
      const args = fs.readFileSync(argsFile, 'utf8').split('\n');
      for (const flag of QUIET_BROWSER_ARGS) expect(args).toContain(flag);
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);

  it('Playwright blocks every request but the page before it loads', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-offline-pw-'));
    try {
      // A Playwright stand-in that records the route rule set before goto
      // and asks it about the remote files the page names.
      const pw = path.join(dir, 'node_modules/playwright');
      fs.mkdirSync(pw, {recursive: true});
      const log = path.join(dir, 'log.json');
      fs.writeFileSync(
        path.join(pw, 'package.json'),
        JSON.stringify({name: 'playwright', main: 'index.js'}),
      );
      fs.writeFileSync(
        path.join(pw, 'index.js'),
        `const fs = require('fs');
         exports.chromium = {async launch(options) {
           fs.writeFileSync(${JSON.stringify(log)} + '.launch', JSON.stringify(options));
           let rule = null;
           return {
             async newPage() { return {
               async route(match, handler) { rule = {match, handler}; },
               async goto(url) {
                 const asked = ['https://fonts.googleapis.com/css2', 'http://127.0.0.1:1/photo.jpg', url].map(u => {
                   const blocked = Boolean(rule && rule.match(new URL(u)));
                   let aborted = null;
                   if (blocked) rule.handler({abort: why => { aborted = why; }});
                   return {u, blocked, aborted};
                 });
                 fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(asked));
               },
               async screenshot({path}) { fs.writeFileSync(path, 'x'); },
             }; },
             async close() {},
           };
         }};`,
      );
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      const html = path.join(dir, 'p.html');
      fs.writeFileSync(html, page());
      const savedPath = process.env.PATH;
      process.env.PATH = path.dirname(process.execPath);
      try {
        const r = await screenshot(
          {cwd: dir, req: createRequire(path.join(dir, 'package.json'))},
          html,
          path.join(dir, 'p.png'),
          'light',
        );
        expect(r.ok).toBe(true);
      } finally {
        process.env.PATH = savedPath;
      }
      const asked = JSON.parse(fs.readFileSync(log, 'utf8'));
      expect(
        asked.map((/** @type {any} */ a) => [a.blocked, a.aborted]),
      ).toEqual([
        [true, 'blockedbyclient'],
        [true, 'blockedbyclient'],
        [false, null],
      ]);
      // The browser itself starts with its network off.
      const launched = JSON.parse(fs.readFileSync(`${log}.launch`, 'utf8'));
      expect(launched.args).toEqual([...QUIET_BROWSER_ARGS]);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);
});
