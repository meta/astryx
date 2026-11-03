// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import http from 'node:http';
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {isRemoteImage, routeRemoteImages} = require('./offline-media.js');

const ORIGIN = 'http://localhost:6006';

describe('isRemoteImage', () => {
  it.each([
    [{url: 'https://picsum.photos/400', resourceType: 'image'}, true],
    [{url: 'https://images.unsplash.com/photo-1', resourceType: 'image'}, true],
    // A fetch() of an image URL, matched by its extension.
    [{url: 'https://placehold.co/600x400.png', resourceType: 'fetch'}, true],
    // The story origin and the loopback host pass.
    [{url: `${ORIGIN}/assets/photo.png`, resourceType: 'image'}, false],
    [{url: 'http://127.0.0.1:9000/a.png', resourceType: 'image'}, false],
    // A remote request that is not an image passes unchanged.
    [
      {url: 'https://fonts.example.com/font.woff2', resourceType: 'font'},
      false,
    ],
    [{url: 'https://api.example.com/data', resourceType: 'fetch'}, false],
    [{url: 'data:image/png;base64,AAAA', resourceType: 'image'}, false],
  ])('%j → %s', (request, expected) => {
    expect(isRemoteImage(request, ORIGIN)).toBe(expected);
  });
});

// The Node test legs install no browser; this proof runs wherever Chromium is
// installed (a workstation, or any job that installs Playwright's Chromium).
const chromiumInstalled = (() => {
  try {
    return fs.existsSync(require('playwright').chromium.executablePath());
  } catch {
    return false;
  }
})();

describe.runIf(chromiumInstalled)('routeRemoteImages in a real browser', () => {
  let server;
  let stalled;
  let origin;
  let chromium;
  // The remote image host resolves to a local server that accepts the
  // connection and never answers: a host that stalls, on every machine.
  const REMOTE_HOST = 'photos.example.test';
  const launch = () =>
    chromium.launch({
      args: [
        `--host-resolver-rules=MAP ${REMOTE_HOST} 127.0.0.1:${stalled.address().port}`,
        // A local sandboxed shell cannot start Chromium's own sandbox; CI can.
        ...(process.env.ASTRYX_NO_BROWSER_SANDBOX === '1'
          ? ['--no-sandbox', '--single-process', '--no-zygote']
          : []),
      ],
    });

  beforeAll(async () => {
    ({chromium} = require('playwright'));
    stalled = http.createServer(() => {});
    await new Promise(resolve => stalled.listen(0, '127.0.0.1', resolve));
    // A story page whose only image lives on the stalling host.
    server = http.createServer((request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(
        `<!doctype html><img id="photo" alt="photo" src="http://${REMOTE_HOST}/photo.jpg">`,
      );
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    stalled?.closeAllConnections();
    await new Promise(resolve => stalled?.close(resolve));
    await new Promise(resolve => server?.close(resolve));
  });

  it('a page whose image host is unreachable still loads at once, with the image drawn locally', async () => {
    const browser = await launch();
    try {
      const context = await browser.newContext();
      await routeRemoteImages(context, origin);
      const page = await context.newPage();
      const started = Date.now();
      await page.goto(`${origin}/`, {waitUntil: 'load', timeout: 10_000});
      const elapsed = Date.now() - started;
      const image = await page.evaluate(() => {
        const element = document.getElementById('photo');
        return {complete: element.complete, width: element.naturalWidth};
      });
      expect(elapsed).toBeLessThan(5_000);
      expect(image).toEqual({complete: true, width: 400});
    } finally {
      await browser.close();
    }
  }, 30_000);

  it('without the route, the same page waits on the unreachable host', async () => {
    const browser = await launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await expect(
        page.goto(`${origin}/`, {waitUntil: 'load', timeout: 3_000}),
      ).rejects.toThrow(/Timeout/);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
