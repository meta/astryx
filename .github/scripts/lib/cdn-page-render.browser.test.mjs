// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file cdn-page-render.browser.test.mjs
 * @input A local page whose module request is never answered, and Chromium;
 *   run with ASTRYX_CDN_SMOKE_BROWSER=1 after `npx playwright install chromium`
 * @output Real-browser proof that a page with a request that hangs never goes
 *   idle, and that renderPage reports that navigation timeout with the hung
 *   request instead of throwing
 * @position The browser half of cdn-page-render.test.mjs, which runs the same
 *   rules against Playwright's events without a browser
 */

import http from 'node:http';
import {chromium} from 'playwright';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {renderPage, renderUntilClean} from './cdn-page-render.mjs';

const PAGE =
  '<!doctype html><button>Start</button>' +
  '<script type="module" src="/stall.js"></script>';

describe.runIf(process.env.ASTRYX_CDN_SMOKE_BROWSER === '1')(
  'renderPage in Chromium',
  () => {
    /** The module responses held open, so the page can never go idle. */
    const held = [];
    let server;
    let url;

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        if (req.url === '/stall.js') {
          held.push(res);
          return;
        }
        res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
        res.end(PAGE);
      });
      await new Promise(resolve => {
        server.listen(0, '127.0.0.1', resolve);
      });
      url = `http://127.0.0.1:${server.address().port}/`;
    });

    afterAll(async () => {
      for (const res of held) {
        res.destroy();
      }
      server.closeAllConnections();
      await new Promise(resolve => {
        server.close(resolve);
      });
    });

    it('reports a page that never goes idle, naming the module that hung', async () => {
      const result = await renderPage(url, {
        launch: async () => chromium.launch(),
        navigationTimeoutMs: 2_000,
      });
      expect(result.timedOut).toBe(true);
      expect(result.pendingRequests).toEqual([`${url}stall.js`]);
    });

    it('fits both attempts at a page that never goes idle inside one deadline', async () => {
      const started = Date.now();
      const result = await renderUntilClean(
        (attempt = {}) =>
          renderPage(url, {
            launch: async () => chromium.launch(),
            budgetMs: attempt.budgetMs,
          }),
        {attempts: 2, deadline: Date.now() + 4_000},
      );
      // Two browser launches beside the 4 s the attempts share.
      expect(Date.now() - started).toBeLessThan(8_000);
      expect(result.timedOut).toBe(true);
      expect(result.pendingRequests).toEqual([`${url}stall.js`]);
    }, 20_000);
  },
);
