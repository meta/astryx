// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file useChatStreamScroll.a11y.chromium.spec.ts
 * @input The actual source hook, React, esbuild and a native Chromium viewport
 * @output Native scroll-position and keyboard-focus regression evidence
 * @position Covers spring integration that jsdom cannot observe. The browser
 *   owns scrollTop, scroll events, layout, matchMedia and animation frames.
 */

import {once} from 'node:events';
import {createServer, type Server} from 'node:http';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@playwright/test';
import {build} from 'esbuild';

const SETTLE_TIMEOUT_MS = 6000;
let server: Server;
let origin: string;
const diagnostics = new WeakMap<
  Page,
  {errors: string[]; externalRequests: string[]}
>();

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(
        new URL('./useChatStreamScroll.fixture.tsx', import.meta.url),
      ),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    // Use the same React installation resolved by the test runner, including
    // when a workspace package manager exposes it outside this source folder.
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
        '<!doctype html><meta charset="utf-8"><title>Chat scroll regression</title><div id="root"></div><script src="/fixture.js"></script>',
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

function viewport(page: Page) {
  return page.getByRole('region', {name: 'Conversation', exact: true});
}

async function position(page: Page) {
  return viewport(page).evaluate(element => ({
    top: element.scrollTop,
    gap: element.scrollHeight - element.clientHeight - element.scrollTop,
    following: element.hasAttribute('data-astryx-chat-following'),
    dpr: devicePixelRatio,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
}

async function atBottom(page: Page) {
  await expect
    .poll(async () => (await position(page)).gap, {timeout: SETTLE_TIMEOUT_MS})
    .toBeLessThanOrEqual(1);
}

async function scrollAway(page: Page, delta = -120) {
  await viewport(page).hover();
  await page.mouse.wheel(0, delta);
  await expect
    .poll(async () => (await position(page)).gap)
    .toBeGreaterThan(100);
  await expect(page.locator('output')).toHaveAttribute('data-locked', 'false');
}

async function keyboardFollow(page: Page) {
  await viewport(page).focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', {name: 'Scroll to bottom', exact: true}),
  ).toBeFocused();
  await page.keyboard.press('Enter');
}

test.beforeEach(async ({page}) => {
  const observed = {errors: [] as string[], externalRequests: [] as string[]};
  diagnostics.set(page, observed);
  page.on('pageerror', error => observed.errors.push(error.message));
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== origin) {
      observed.externalRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(origin);
  await atBottom(page);
});

test.afterEach(async ({page}, info) => {
  if (await viewport(page).count()) {
    await info.attach('native-scroll-state', {
      contentType: 'application/json',
      body: JSON.stringify(await position(page)),
    });
  }
  expect(diagnostics.get(page)).toEqual({errors: [], externalRequests: []});
});

for (const dpr of [1, 2]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`DPR ${dpr}, ${reducedMotion}`, () => {
      test.use({deviceScaleFactor: dpr, contextOptions: {reducedMotion}});
      test('keyboard follow reaches the actual bottom without moving focus', async ({
        page,
      }) => {
        expect(await position(page)).toMatchObject({
          dpr,
          reducedMotion: reducedMotion === 'reduce',
        });
        await scrollAway(page);
        await keyboardFollow(page);
        await atBottom(page);
        await expect(
          page.getByRole('button', {name: 'Scroll to bottom', exact: true}),
        ).toBeFocused();
        expect((await position(page)).following).toBe(true);
      });
    });
  }
}

test('new content follows to the new bottom while locked', async ({page}) => {
  await page
    .getByRole('button', {name: 'Append messages', exact: true})
    .click();
  await atBottom(page);
  expect((await position(page)).following).toBe(true);
});

test('new content leaves an unlocked reading position in place', async ({
  page,
}) => {
  await scrollAway(page, -600);
  const before = await position(page);
  await page
    .getByRole('button', {name: 'Append messages', exact: true})
    .click();
  await expect
    .poll(async () => (await position(page)).gap)
    .toBeGreaterThan(before.gap + 300);
  const after = await position(page);
  expect(after.following).toBe(false);
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
});

test('a viewport resize during follow settles at its current bottom', async ({
  page,
}) => {
  await scrollAway(page, -1000);
  await keyboardFollow(page);
  await page
    .getByRole('button', {name: 'Resize viewport', exact: true})
    .click();
  await atBottom(page);
  await page
    .getByRole('button', {name: 'Resize viewport', exact: true})
    .click();
  await atBottom(page);
  expect((await position(page)).following).toBe(true);
});

test('an instant jump cancels follow and a later keyboard jump starts from the reader', async ({
  page,
}) => {
  await scrollAway(page, -1000);
  await keyboardFollow(page);
  await page.getByRole('button', {name: 'Jump instantly', exact: true}).click();
  await atBottom(page);
  await scrollAway(page);
  await keyboardFollow(page);
  await atBottom(page);
  await expect(
    page.getByRole('button', {name: 'Scroll to bottom', exact: true}),
  ).toBeFocused();
});

test('an upward wheel interrupts a running spring', async ({page}, info) => {
  await scrollAway(page, -1000);
  const readingPosition = await position(page);
  await keyboardFollow(page);
  await expect(page.locator('output')).toHaveAttribute('data-locked', 'true');
  await expect
    .poll(async () => (await position(page)).top)
    .toBeGreaterThan(readingPosition.top);
  const beforeWheel = await position(page);
  expect(beforeWheel.following).toBe(true);
  expect(beforeWheel.gap).toBeGreaterThan(100);
  // scrollAway left the pointer over the viewport. Interrupt immediately,
  // before another pointer-positioning action can let the spring settle.
  await page.mouse.wheel(0, -600);
  await info.attach('native-spring-before-interruption', {
    contentType: 'application/json',
    body: JSON.stringify({readingPosition, beforeWheel}),
  });
  await expect
    .poll(async () => (await position(page)).gap)
    .toBeGreaterThan(100);
  await expect(page.locator('output')).toHaveAttribute('data-locked', 'false');
  const tops = await viewport(page).evaluate(
    async element =>
      new Promise<number[]>(resolve => {
        const samples: number[] = [];
        const end = performance.now() + 250;
        const sample = () => {
          samples.push(element.scrollTop);
          if (performance.now() < end) {
            requestAnimationFrame(sample);
          } else {
            resolve(samples);
          }
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  expect((await position(page)).following).toBe(false);
});
