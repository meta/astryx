// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/ ^packages/core/src/ContextMenu/ ^packages/core/src/hooks/(useLongPress|longPressDetector)

/**
 * @file TableCellMenuLoad.a11y.chromium.spec.ts
 * @input The TableCellMenuLoad fixture built from source with Vite (a client
 *   build and a server build), React's server renderer and hydrateRoot, and
 *   native Chromium mouse, keyboard and touch
 * @output Browser evidence for an invocation that reaches a table cell while
 *   its menu code still loads: the server-rendered table hydrates without a
 *   recoverable error, the browser's own menu stays shut, the held invocation
 *   opens the cell's menu once when the code arrives, focus lands on the first
 *   row (with no keyboard ring after a mouse open), and Escape hands it back.
 *   With no invocation, the load changes no box and no axe result
 * @position Real-browser layer for TableCellContextMenu's early invocations
 *   (spec:AST-013 FR9, FR10, FR13). The fixture server holds the menu chunk
 *   until the test releases it.
 */

import {once} from 'node:events';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import {createServer, type Server, type ServerResponse} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {tap, touchDriver} from '@astryxdesign/interaction-harness';
import {build} from 'vite';

const CONFIG = path.resolve(
  'packages/core/src/Table/__tests__/TableCellMenuLoad.vite.mjs',
);
const SERVER_ENTRY = path.resolve(
  'packages/core/src/Table/__tests__/TableCellMenuLoad.server.tsx',
);

let server: Server;
let origin: string;
let menuChunkFile: string;

/** The fixture server holds the menu chunk until a test releases it. */
const gate = {
  released: false,
  requests: 0,
  waiting: [] as (() => void)[],
};

function release() {
  gate.released = true;
  for (const send of gate.waiting.splice(0)) {
    send();
  }
}

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
};

test.beforeAll(async () => {
  // A folder per worker, so parallel workers never share a build.
  const out = path.resolve(
    `test-results/table-cell-menu-load-${test.info().parallelIndex}`,
  );
  const clientDir = path.join(out, 'client');
  const serverDir = path.join(out, 'server');
  await build({
    configFile: CONFIG,
    logLevel: 'warn',
    build: {outDir: clientDir, emptyOutDir: true},
  });
  await build({
    configFile: CONFIG,
    logLevel: 'warn',
    build: {
      outDir: serverDir,
      emptyOutDir: true,
      ssr: SERVER_ENTRY,
      manifest: false,
      rollupOptions: {
        input: SERVER_ENTRY,
        external: [/^react(?:-dom)?(?:\/|$)/],
        output: {entryFileNames: '[name].mjs'},
      },
    },
  });
  const {renderHtml} = (await import(
    pathToFileURL(path.join(serverDir, 'TableCellMenuLoad.server.mjs')).href
  )) as {renderHtml: () => string};
  const manifest = JSON.parse(
    fs.readFileSync(path.join(clientDir, '.vite/manifest.json'), 'utf8'),
  ) as Record<string, {file: string; src?: string}>;
  const menuChunk = Object.values(manifest).find(chunk =>
    chunk.src?.endsWith('tableContextMenu.tsx'),
  )?.file;
  if (menuChunk == null) {
    throw new Error('the build has no lazy table menu chunk');
  }
  menuChunkFile = menuChunk;
  const page = fs
    .readFileSync(path.join(clientDir, 'TableCellMenuLoad.html'), 'utf8')
    .replace('<!--ssr-->', renderHtml());
  const send = (response: ServerResponse, type: string, body: Uint8Array) => {
    response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
    });
    response.end(body);
  };
  server = createServer((request, response) => {
    const name = (request.url ?? '/').split('?')[0].slice(1);
    if (name === '') {
      send(response, 'text/html', Buffer.from(page));
      return;
    }
    const file = path.join(clientDir, name);
    if (!file.startsWith(clientDir) || !fs.existsSync(file)) {
      response.writeHead(404);
      response.end();
      return;
    }
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    const body = fs.readFileSync(file);
    if (name === menuChunk) {
      gate.requests += 1;
      if (!gate.released) {
        gate.waiting.push(() => send(response, type, body));
        return;
      }
    }
    send(response, type, body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('the fixture server has no address');
  }
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  release();
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
});

type PageState = {
  __shows: number;
  __contextmenus: boolean[];
  __recoverable: string[];
};

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({page}) => {
  gate.released = false;
  gate.requests = 0;
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      pageErrors.push(message.text());
    }
  });
  // Counts menu opens, and records whether each contextmenu event reached
  // the window with its default prevented, so the browser's menu stayed shut.
  await page.addInitScript(() => {
    const state = window as unknown as PageState;
    state.__shows = 0;
    state.__contextmenus = [];
    const show = HTMLElement.prototype.showPopover;
    HTMLElement.prototype.showPopover = function (
      this: HTMLElement,
      ...args: Parameters<typeof show>
    ) {
      state.__shows += 1;
      return show.apply(this, args);
    };
    window.addEventListener('contextmenu', event => {
      state.__contextmenus.push(event.defaultPrevented);
    });
  });
  await page.goto(origin);
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  // The server markup hydrated as is, and the menu code is still held.
  expect(
    await page.evaluate(() => (window as unknown as PageState).__recoverable),
  ).toEqual([]);
  expect(gate.requests).toBeLessThanOrEqual(1);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test.afterEach(async ({page}) => {
  expect(errors.get(page)).toEqual([]);
});

const state = async (page: Page) =>
  page.evaluate(() => {
    const {__shows, __contextmenus} = window as unknown as PageState;
    return {
      shows: __shows,
      contextmenus: __contextmenus,
      focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
    };
  });

const cell = (page: Page) => page.getByRole('cell', {name: /Alice/});

async function cellPoint(page: Page) {
  const box = await cell(page).boundingBox();
  if (box == null) {
    throw new Error('the cell has no rendered bounds');
  }
  return {x: Math.round(box.x) + 12, y: Math.round(box.y) + 10};
}

/** Lets a second open, if one were coming, arrive before the count. */
async function settle(page: Page) {
  await page.waitForTimeout(300);
}

const AXE_DISABLED_RULES = [
  // The fixture is a fragment, not a page.
  'landmark-one-main',
  'page-has-heading-one',
  'region',
];

async function axeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({page})
    .disableRules(AXE_DISABLED_RULES)
    .analyze();
  return results.violations.map(
    violation =>
      `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`,
  );
}

/** The boxes of the cell, its menu trigger and its button. */
async function cellBoxes(page: Page) {
  return {
    cell: await cell(page).boundingBox(),
    trigger: await cell(page).locator('> *').first().boundingBox(),
    button: await page.getByRole('button', {name: 'Edit'}).boundingBox(),
  };
}

test('the menu load changes no box in the cell and no axe result', async ({
  page,
}) => {
  const before = await cellBoxes(page);
  expect(await axeViolations(page)).toEqual([]);

  release();
  // The browser received the menu code.
  await page.waitForFunction(
    file =>
      performance
        .getEntriesByType('resource')
        .some(entry => entry.name.endsWith(file)),
    menuChunkFile,
  );
  await settle(page);

  expect(await cellBoxes(page)).toEqual(before);
  expect(await axeViolations(page)).toEqual([]);
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect((await state(page)).shows).toBe(0);

  // The loaded menu opens on the first right-click.
  const point = await cellPoint(page);
  await page.mouse.click(point.x, point.y, {button: 'right'});
  await expect(page.getByRole('menuitem', {name: 'Copy'})).toBeFocused();
  expect((await state(page)).contextmenus).toEqual([true]);
});

test('a right-click before the menu code arrives keeps the browser menu shut and opens the cell menu once, focused without a ring', async ({
  page,
}) => {
  const point = await cellPoint(page);
  await page.mouse.click(point.x, point.y, {button: 'right'});
  expect((await state(page)).contextmenus).toEqual([true]);
  await expect(page.getByRole('menu')).toHaveCount(0);
  // The invocation asked for the menu code, which the server still holds.
  expect(gate.requests).toBe(1);

  release();

  const first = page.getByRole('menuitem', {name: 'Copy'});
  await expect(first).toBeFocused();
  await settle(page);
  expect(await state(page)).toMatchObject({shows: 1, focusVisible: false});
  // The menu opened at the pointer.
  const anchor = await cell(page)
    .locator('span[aria-hidden="true"][style*="anchor-name"]')
    .boundingBox();
  expect(Math.abs((anchor?.x ?? 0) - point.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((anchor?.y ?? 0) - point.y)).toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  // Focus was on the page before the right-click, and goes back there.
  expect(
    await page.evaluate(() => document.activeElement === document.body),
  ).toBe(true);
});

test('Shift+F10 before the menu code arrives opens the cell menu once, and Escape hands focus back', async ({
  page,
}) => {
  const edit = page.getByRole('button', {name: 'Edit'});
  await edit.focus();
  await page.keyboard.press('Shift+F10');
  expect((await state(page)).contextmenus).toEqual([true]);
  await expect(page.getByRole('menu')).toHaveCount(0);
  // The invocation asked for the menu code, which the server still holds.
  expect(gate.requests).toBe(1);

  release();

  await expect(page.getByRole('menuitem', {name: 'Copy'})).toBeFocused();
  await settle(page);
  expect((await state(page)).shows).toBe(1);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(edit).toBeFocused();
});

test.describe('on a touch screen', () => {
  test.use({hasTouch: true});

  test('a long press lifted before the menu code arrives opens the cell menu once at the finger, and Escape hands focus back', async ({
    page,
  }) => {
    const point = await cellPoint(page);
    const driver = await touchDriver(page);
    await driver.play(tap(point, {holdMs: 800}));
    await expect(page.getByRole('menu')).toHaveCount(0);
    // The browser's own menu stayed shut for any contextmenu the press sent.
    expect((await state(page)).contextmenus.every(Boolean)).toBe(true);
    expect(gate.requests).toBe(1);

    release();

    await expect(page.getByRole('menuitem', {name: 'Copy'})).toBeFocused();
    await settle(page);
    expect((await state(page)).shows).toBe(1);
    // The menu opened at the finger.
    const anchor = await cell(page)
      .locator('span[aria-hidden="true"][style*="anchor-name"]')
      .boundingBox();
    expect(Math.abs((anchor?.x ?? 0) - point.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((anchor?.y ?? 0) - point.y)).toBeLessThanOrEqual(1);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    // Focus was on the page before the press, and goes back there.
    expect(
      await page.evaluate(() => document.activeElement === document.body),
    ).toBe(true);
  });
});
