// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useChatStreamScrollPage.a11y.browser.spec.ts
 * @input The actual source hook, React, esbuild, and native Chromium and
 *   WebKit viewports
 * @output Evidence that the stream scroll follows a page whose document
 *   scrolls: the reader's scroll up shows the scroll button and stops follow
 * @position Covers the page's own scroll, which jsdom cannot raise: a browser
 *   fires it at the document, and only a layout engine moves the root.
 */

import {once} from 'node:events';
import {createServer, type Server} from 'node:http';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {build} from 'esbuild';

const SETTLE_TIMEOUT_MS = 6000;
let server: Server;
let origin: string;

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(
        new URL('./useChatStreamScrollPage.fixture.tsx', import.meta.url),
      ),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    alias: {
      react: fileURLToPath(import.meta.resolve('react')),
      'react/jsx-runtime': fileURLToPath(
        import.meta.resolve('react/jsx-runtime'),
      ),
      'react-dom/client': fileURLToPath(
        import.meta.resolve('react-dom/client'),
      ),
    },
    define: {'process.env.NODE_ENV': '"production"'},
  });
  const script = result.outputFiles[0].contents;
  server = createServer((request, response) => {
    if (request.url === '/fixture.js') {
      response.writeHead(200, {'Content-Type': 'text/javascript'});
      response.end(script);
    } else if (request.url === '/') {
      response.writeHead(200, {'Content-Type': 'text/html'});
      response.end(
        '<!doctype html><meta charset="utf-8"><title>Chat page scroll regression</title><body style="margin:0"><div id="root"></div><script src="/fixture.js"></script></body>',
      );
    } else {
      response.writeHead(204);
      response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing fixture address');
  }
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
});

async function pageGap(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollHeight - root.clientHeight - root.scrollTop;
  });
}

function signal(page: Page) {
  return page.locator('output');
}

// WebKit animates a wheel scroll over several frames. The page is at rest
// when two reads 100 ms apart agree.
async function restingTop(page: Page) {
  let last = -1;
  await expect
    .poll(
      async () => {
        const top = await page.evaluate(
          () => document.documentElement.scrollTop,
        );
        const isStill = top === last;
        last = top;
        return isStill;
      },
      {timeout: SETTLE_TIMEOUT_MS, intervals: [100]},
    )
    .toBe(true);
  return last;
}

async function scrollPageUp(page: Page, distance = 600) {
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, -distance);
  await expect
    .poll(async () => pageGap(page), {timeout: SETTLE_TIMEOUT_MS})
    .toBeGreaterThan(100);
  return restingTop(page);
}

test.beforeEach(async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await expect
    .poll(async () => pageGap(page), {timeout: SETTLE_TIMEOUT_MS})
    .toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('opens at the end of the page, following, with no scroll button', async ({
  page,
}) => {
  await expect(signal(page)).toHaveAttribute('data-locked', 'true');
  await expect(signal(page)).toHaveAttribute('data-scrolled-up', 'false');
});

test('shows the scroll button and stops following when the reader scrolls the page up', async ({
  page,
}) => {
  await scrollPageUp(page);
  await expect(signal(page)).toHaveAttribute('data-scrolled-up', 'true');
  await expect(signal(page)).toHaveAttribute('data-locked', 'false');
});

test('leaves a reader who scrolled up in place when messages arrive', async ({
  page,
}) => {
  const before = await scrollPageUp(page);
  await page.getByRole('button', {name: 'Append messages'}).click();
  // Two frames give a locked spring time to move; an unlocked page stays.
  await page.evaluate(async () => {
    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.documentElement.scrollTop);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
});

test('puts a message at the top of the viewport with scrollToMessage', async ({
  page,
}) => {
  // A reader's scroll, not a script's. A script's scroll can land between two
  // frames of the opening follow, which then takes the page back to its end.
  await scrollPageUp(page, 1300);
  await page.getByRole('button', {name: 'Scroll to the message'}).click();
  await expect
    .poll(
      async () =>
        page
          .locator('[data-message]')
          .evaluate(element => Math.round(element.getBoundingClientRect().top)),
      {timeout: SETTLE_TIMEOUT_MS},
    )
    .toBe(0);
});
