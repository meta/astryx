// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import http from 'node:http';
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  isRemoteImage,
  isRemoteNonImage,
  routeRemoteImages,
} = require('./offline-media.js');

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

describe('isRemoteNonImage', () => {
  it.each([
    [{url: 'https://fonts.example.com/font.woff2', resourceType: 'font'}, true],
    [{url: 'https://api.example.com/data', resourceType: 'fetch'}, true],
    [{url: 'https://cdn.example.com/app.js', resourceType: 'script'}, true],
    // A remote image gets the stand-in, so it is not blocked.
    [{url: 'https://picsum.photos/400', resourceType: 'image'}, false],
    [{url: 'https://placehold.co/600x400.png', resourceType: 'fetch'}, false],
    // The story origin, the loopback host and URLs with no network pass.
    [{url: `${ORIGIN}/iframe.html`, resourceType: 'document'}, false],
    [{url: 'http://127.0.0.1:9000/fixture.js', resourceType: 'script'}, false],
    [{url: 'http://[::1]:9000/fixture.js', resourceType: 'script'}, false],
    [{url: 'http://localhost:9000/a.css', resourceType: 'stylesheet'}, false],
    [{url: 'data:text/css,a{}', resourceType: 'stylesheet'}, false],
    [{url: 'blob:http://localhost:6006/1', resourceType: 'fetch'}, false],
  ])('%j → %s', (request, expected) => {
    expect(isRemoteNonImage(request, ORIGIN)).toBe(expected);
  });

  it('with no story origin, only the loopback host is local', () => {
    const request = {url: `${ORIGIN}/iframe.html`, resourceType: 'document'};
    expect(isRemoteNonImage(request, undefined)).toBe(false);
    expect(
      isRemoteNonImage(
        {url: 'https://stories.example.com/', resourceType: 'document'},
        undefined,
      ),
    ).toBe(true);
  });
});

// The Node test legs install no browser; this proof runs wherever Chromium is
// installed. CI's "Offline-media browser cases" step sets
// ASTRYX_OFFLINE_MEDIA_BROWSER=1, so a missing browser there fails the cases
// instead of skipping them.
const browserRequired = process.env.ASTRYX_OFFLINE_MEDIA_BROWSER === '1';
const chromiumInstalled = (() => {
  try {
    return fs.existsSync(require('playwright').chromium.executablePath());
  } catch {
    return false;
  }
})();

describe.runIf(browserRequired || chromiumInstalled)('routeRemoteImages in a real browser', () => {
  let server;
  let stalled;
  let origin;
  let browser;
  let stalledConnections = 0;
  // The remote image host resolves to a local server that accepts the
  // connection and never answers: a host that stalls, on every machine.
  const REMOTE_HOST = 'photos.example.test';

  beforeAll(async () => {
    const {chromium} = require('playwright');
    stalled = http.createServer(() => {});
    stalled.on('connection', () => {
      stalledConnections += 1;
    });
    await new Promise(resolve => stalled.listen(0, '127.0.0.1', resolve));
    // A story page whose only image lives on the stalling host.
    server = http.createServer((request, response) => {
      response.setHeader('content-type', 'text/html');
      if (request.url === '/with-script') {
        // A page that also loads a script from the stalling host.
        response.end(
          `<!doctype html><img id="photo" alt="photo" src="http://${REMOTE_HOST}/photo.jpg"><script src="http://${REMOTE_HOST}/app.js"></script>`,
        );
        return;
      }
      response.end(
        `<!doctype html><img id="photo" alt="photo" src="http://${REMOTE_HOST}/photo.jpg">`,
      );
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    // One browser serves every case, and each case opens its own context.
    browser = await chromium.launch({
      args: [
        `--host-resolver-rules=MAP ${REMOTE_HOST} 127.0.0.1:${stalled.address().port}`,
        // A local sandboxed shell cannot start Chromium's own sandbox; CI can.
        ...(process.env.ASTRYX_NO_BROWSER_SANDBOX === '1'
          ? ['--no-sandbox', '--single-process', '--no-zygote']
          : []),
      ],
    });
  });

  afterAll(async () => {
    await browser?.close();
    stalled?.closeAllConnections();
    await new Promise(resolve => stalled?.close(resolve));
    await new Promise(resolve => server?.close(resolve));
  });

  /** Resolves with the response to the stalling host's next request for `path`. */
  const nextRequest = path =>
    new Promise(resolve => {
      const onRequest = (request, response) => {
        if (request.url !== path) {
          return;
        }
        stalled.off('request', onRequest);
        resolve(response);
      };
      stalled.on('request', onRequest);
    });

  it('a page whose image host is unreachable still loads at once, with the image drawn locally', async () => {
    const context = await browser.newContext();
    try {
      await routeRemoteImages(context, origin);
      const page = await context.newPage();
      const connectionsBefore = stalledConnections;
      await page.goto(`${origin}/`, {waitUntil: 'load'});
      const image = await page.evaluate(() => {
        const element = document.getElementById('photo');
        return {complete: element.complete, width: element.naturalWidth};
      });
      // No request reached the stalling host, so the load waited on nothing.
      expect(stalledConnections).toBe(connectionsBefore);
      expect(image).toEqual({complete: true, width: 400});
    } finally {
      await context.close();
    }
  }, 30_000);

  it('with abortOther, a remote script fails at once and the page still loads', async () => {
    const context = await browser.newContext();
    try {
      await routeRemoteImages(context, origin, {abortOther: true});
      const page = await context.newPage();
      const failed = [];
      page.on('requestfailed', request => failed.push(request.url()));
      const connectionsBefore = stalledConnections;
      await page.goto(`${origin}/with-script`, {waitUntil: 'load'});
      const width = await page.evaluate(
        () => document.getElementById('photo').naturalWidth,
      );
      expect(stalledConnections).toBe(connectionsBefore);
      expect(width).toBe(400);
      expect(failed).toEqual([`http://${REMOTE_HOST}/app.js`]);
    } finally {
      await context.close();
    }
  }, 30_000);

  it('without abortOther, the remote script still holds the page', async () => {
    const context = await browser.newContext();
    try {
      await routeRemoteImages(context, origin);
      const page = await context.newPage();
      const held = nextRequest('/app.js');
      const navigation = page.goto(`${origin}/with-script`, {
        waitUntil: 'load',
      });
      const response = await held;
      // The script blocks the parser while the host holds its request.
      expect(await page.evaluate(() => document.readyState)).toBe('loading');
      // The page loads once the host answers.
      response.end();
      await navigation;
      expect(await page.evaluate(() => document.readyState)).toBe('complete');
    } finally {
      await context.close();
    }
  }, 30_000);

  it('without the route, the same page waits on the unreachable host', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const held = nextRequest('/photo.jpg');
      const navigation = page.goto(`${origin}/`, {waitUntil: 'load'});
      const response = await held;
      // The document is parsed, and its load waits for the image the host holds.
      await page.waitForFunction(() => document.readyState !== 'loading');
      expect(await page.evaluate(() => document.readyState)).toBe(
        'interactive',
      );
      response.end();
      await navigation;
      expect(await page.evaluate(() => document.readyState)).toBe('complete');
    } finally {
      await context.close();
    }
  }, 30_000);
});
