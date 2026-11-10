// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/ ^packages/core/src/ContextMenu/ ^packages/core/src/hooks/(useLongPress|longPressDetector)

/**
 * @file TableCellMenuLoad.a11y.chromium.spec.ts
 * @input Core's built package, React's server renderer and hydrateRoot,
 *   esbuild with code splitting, and native Chromium mouse, keyboard and touch
 * @output Browser evidence for an invocation that reaches a table cell while
 *   its menu code still loads: the server-rendered table hydrates without a
 *   recoverable error, the browser's own menu stays shut, the held invocation
 *   opens the cell's menu once when the code arrives, focus lands on the first
 *   row (with no keyboard ring after a mouse open), and Escape hands it back
 * @position Real-browser layer for TableCellContextMenu's early invocations
 *   (spec:AST-013 FR9, FR10, FR13). The fixture server holds the menu chunk
 *   until the test releases it.
 */

import {once} from 'node:events';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createServer, type Server, type ServerResponse} from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {tap, touchDriver} from '@astryxdesign/interaction-harness';
import {build} from 'esbuild';

const CORE = fileURLToPath(new URL('../../../', import.meta.url));

const APP = `
import * as React from 'react';
import {Table, TableBody, TableRow, TableCell} from '@astryxdesign/core';

const actions = [
  {id: 'copy', label: 'Copy', onSelect: () => {}},
  {id: 'paste', label: 'Paste', onSelect: () => {}},
];

function Hydrated() {
  React.useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
  return null;
}

export function Root() {
  return (
    <>
      <Table>
        <TableBody>
          <TableRow>
            <TableCell contextMenuActions={actions}>
              Alice <button type="button">Edit</button>
            </TableCell>
            <TableCell>Plain cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Hydrated />
    </>
  );
}
`;

const CLIENT = `
import {hydrateRoot} from 'react-dom/client';
import {Root} from './app.jsx';

window.__recoverable = [];
hydrateRoot(document.getElementById('root'), <Root />, {
  onRecoverableError: error => window.__recoverable.push(String(error)),
});
`;

const SERVER = `
import {renderToString} from 'react-dom/server';
import {Root} from './app.jsx';

export const html = renderToString(<Root />);
`;

let server: Server;
let origin: string;
let scratch: string;

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

test.beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cell-menu-load-'));
  fs.writeFileSync(path.join(scratch, 'app.jsx'), APP);
  fs.writeFileSync(path.join(scratch, 'client.jsx'), CLIENT);
  fs.writeFileSync(path.join(scratch, 'server.jsx'), SERVER);
  const shared = {
    absWorkingDir: CORE,
    nodePaths: [path.join(CORE, 'node_modules')],
    alias: {'@astryxdesign/core': path.join(CORE, 'dist/index.js')},
    bundle: true,
    jsx: 'automatic' as const,
    define: {'process.env.NODE_ENV': '"production"'},
    loader: {'.css': 'empty' as const},
    logLevel: 'silent' as const,
  };
  await build({
    ...shared,
    entryPoints: [path.join(scratch, 'server.jsx')],
    platform: 'node',
    format: 'cjs',
    outfile: path.join(scratch, 'server.cjs'),
  });
  const {html} = createRequire(import.meta.url)(
    path.join(scratch, 'server.cjs'),
  ) as {html: string};
  const client = await build({
    ...shared,
    entryPoints: [path.join(scratch, 'client.jsx')],
    platform: 'browser',
    format: 'esm',
    splitting: true,
    outdir: path.join(scratch, 'client'),
    entryNames: 'client',
    write: false,
    metafile: true,
  });
  const files = new Map(
    client.outputFiles.map(file => [path.basename(file.path), file.contents]),
  );
  const menuChunk = Object.entries(client.metafile.outputs).find(([, output]) =>
    output.entryPoint?.endsWith('Table/tableContextMenu.js'),
  )?.[0];
  if (menuChunk == null) {
    throw new Error('the bundle has no lazy table menu chunk');
  }
  const gated = path.basename(menuChunk);
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>Table cell menu load</title><link rel="stylesheet" href="/reset.css"><link rel="stylesheet" href="/astryx.css"></head><body><div id="root">${html}</div><script type="module" src="/client.js"></script></body></html>`;
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
    } else if (name === 'reset.css' || name === 'astryx.css') {
      const file = name === 'reset.css' ? 'src/reset.css' : 'dist/astryx.css';
      send(response, 'text/css', fs.readFileSync(path.join(CORE, file)));
    } else if (files.has(name)) {
      const body = files.get(name) as Uint8Array;
      if (name === gated) {
        gate.requests += 1;
        if (!gate.released) {
          gate.waiting.push(() => send(response, 'text/javascript', body));
          return;
        }
      }
      send(response, 'text/javascript', body);
    } else {
      response.writeHead(404);
      response.end();
    }
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
  if (scratch) {
    fs.rmSync(scratch, {recursive: true, force: true});
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
