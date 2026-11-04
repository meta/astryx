// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/playwright|\.github/scripts/lib/offline-media)

/**
 * @file hermetic.chromium.spec.ts
 * @input The shared base test (`../playwright`) and a local page that loads a
 *   remote image, a remote stylesheet and a local file
 * @output Browser evidence that every context of the base test answers remote
 *   images locally, blocks other remote requests and passes local ones
 * @position Proof for the base test that every browser spec imports.
 */

import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {expect, test, type Page} from '../playwright';

// `.test` names never resolve, so a request that reaches the network fails
// with a name error. Only the route can fulfil or block one.
const PAGE = `<!doctype html>
<link rel="stylesheet" href="https://fonts.example.test/font.css">
<img id="photo" alt="photo" src="https://photos.example.test/photo.jpg">
<script>
  window.localStatus = fetch('/local.json').then(response => response.status);
</script>`;

// A request the route aborts fails as blocked by the client; one that reached
// the network would fail with a name error instead.
const BLOCKED = expect.stringContaining('net::ERR_BLOCKED_BY_CLIENT');

let server: http.Server;
let origin: string;

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === '/local.json') {
      response.setHeader('content-type', 'application/json');
      response.end('{}');
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.end(PAGE);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise(resolve => server?.close(resolve));
});

async function loadAndObserve(page: Page) {
  const failed = new Map<string, string>();
  page.on('requestfailed', request => {
    failed.set(request.url(), request.failure()?.errorText ?? '');
  });
  await page.goto(`${origin}/`, {waitUntil: 'load'});
  const facts = await page.evaluate(async () => {
    const photo = document.getElementById('photo') as HTMLImageElement;
    const status = await (window as unknown as {localStatus: Promise<number>})
      .localStatus;
    return {photoWidth: photo.naturalWidth, localStatus: status};
  });
  return {
    ...facts,
    stylesheetError: failed.get('https://fonts.example.test/font.css'),
  };
}

test('the page fixture answers remote images locally and blocks other remote requests', async ({
  page,
}) => {
  expect(await loadAndObserve(page)).toEqual({
    photoWidth: 400,
    localStatus: 200,
    stylesheetError: BLOCKED,
  });
});

test('a context the spec makes from the browser has the same rule', async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    expect(await loadAndObserve(await context.newPage())).toEqual({
      photoWidth: 400,
      localStatus: 200,
      stylesheetError: BLOCKED,
    });
  } finally {
    await context.close();
  }
});

test('a page the spec opens with browser.newPage has the same rule', async ({
  browser,
}) => {
  const page = await browser.newPage();
  try {
    expect(await loadAndObserve(page)).toEqual({
      photoWidth: 400,
      localStatus: 200,
      stylesheetError: BLOCKED,
    });
  } finally {
    await page.close();
  }
});
