// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentationHold.interaction.browser.spec.ts
 * @input The presentation-hold fixture bundled with esbuild, a phone-sized
 *   touch screen, and real engine touch input (touchDriver)
 * @output Browser proof of what the unit tests cannot see: the hold's shield
 *   is the hit target over the whole viewport, above a modal dialog in the
 *   top layer; a tap during a hold reaches no click and no recognizer on the
 *   layer (the gesture host's touch gate) and leaves a light-dismissing
 *   popover open; a layer root that takes no hits itself (pointer-events:
 *   none, or visibility: hidden, its content opting back in) is held all the
 *   same; keys still act while a presentation holds; a dismissal's
 *   hold makes the content inert and moves focus out of it, so no key acts
 *   on it either (a focused button that turns inert still takes Enter and
 *   Space in both engines); each release gives input back; a one-finger
 *   pan on the shield scrolls nothing while a pinch on it still zooms the
 *   page (spec:AST-094 FR10, FR18, FR35; Chromium, which pinch-zooms from
 *   injected touches)
 * @position Browser tests of packages/core/src/Layer/presentationHold.ts, run
 *   by the interaction project (`pnpm test:interaction presentationHold`)
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {expect, test, type Page} from '@playwright/test';
import {
  drag,
  pinch,
  touchDriver,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

type Point = {x: number; y: number};
type Scope = 'viewport' | 'layer';
type LayerId = 'dialog' | 'pop' | 'lift';

interface HoldApi {
  log: {clicks: string[]; taps: number; toggles: string[]};
  open: (id: LayerId) => void;
  hold: (id: LayerId, scope: Scope) => void;
  release: () => void;
  hitAt: (x: number, y: number) => string;
}

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'presentationHold.fixture.ts',
      ),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
  });
  bundle = result.outputFiles[0].text;
});

async function load(page: Page): Promise<TouchDriver> {
  // A real navigation first: touch emulation exposes the Touch Events API to
  // documents it creates.
  await page.goto('about:blank');
  await page.setContent(
    '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
  );
  await page.addScriptTag({content: bundle});
  return touchDriver(page);
}

type HoldWindow = {__hold: HoldApi};

const open = async (page: Page, id: LayerId) =>
  page.evaluate(layer => {
    (window as unknown as HoldWindow).__hold.open(layer);
  }, id);
const hold = async (page: Page, id: LayerId, scope: Scope) =>
  page.evaluate(
    ([layer, how]) => {
      (window as unknown as HoldWindow).__hold.hold(layer, how);
    },
    [id, scope] as const,
  );
const release = async (page: Page) =>
  page.evaluate(() => {
    (window as unknown as HoldWindow).__hold.release();
  });
const hitAt = async (page: Page, point: Point) =>
  page.evaluate(
    at => (window as unknown as HoldWindow).__hold.hitAt(at.x, at.y),
    point,
  );
const readLog = async (page: Page) =>
  page.evaluate(() => (window as unknown as HoldWindow).__hold.log);

async function centre(page: Page, id: string): Promise<Point> {
  const box = await page.locator(`#${id}`).boundingBox();
  if (box == null) {
    throw new Error(`#${id} has no box`);
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

// A tap's click (or its recognition) lands within a few frames.
const settle = async (page: Page) => page.waitForTimeout(250);

test('while a presentation holds a modal dialog, a tap on it or beside it reaches nothing, keys still act, and the release gives touch back', async ({
  page,
}) => {
  const driver = await load(page);
  await open(page, 'dialog');
  const action = await centre(page, 'action');
  const message = await centre(page, 'message');
  const beside = {x: 12, y: 12};
  await hold(page, 'dialog', 'viewport');
  // The shield is what a touch hits, on the dialog and over its backdrop.
  expect(await hitAt(page, action)).toBe('shield:dialog');
  expect(await hitAt(page, beside)).toBe('shield:dialog');
  await driver.tap(action);
  await driver.tap(message);
  await settle(page);
  // No click, and the recognizer on the dialog saw nothing: the gate.
  expect(await readLog(page)).toEqual({clicks: [], taps: 0, toggles: []});
  // Keys still act while a presentation holds.
  await page.locator('#action').focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await readLog(page)).clicks)
    .toEqual(['action']);
  await release(page);
  expect(await hitAt(page, action)).toBe('action');
  expect(await hitAt(page, beside)).toBe('dialog');
  await driver.tap(message);
  await expect.poll(async () => (await readLog(page)).taps).toBe(1);
});

test('while a dismissal holds it, its content is inert, focus and keys leave it, and the shield still takes every tap; the release restores both', async ({
  page,
}) => {
  const driver = await load(page);
  await open(page, 'dialog');
  const action = await centre(page, 'action');
  const message = await centre(page, 'message');
  // The dialog moved focus to its action when it opened.
  expect(await page.evaluate(() => document.activeElement?.id ?? null)).toBe(
    'action',
  );
  await hold(page, 'dialog', 'layer');
  // A key reaches nothing: the focused action left the inert content.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await settle(page);
  expect((await readLog(page)).clicks).toEqual([]);
  // An inert subtree is no hit target: the shield, in the dialog, is.
  expect(await hitAt(page, action)).toBe('shield:dialog');
  const state = async () =>
    page.evaluate(() => {
      const button = document.getElementById('action');
      button?.focus();
      return {
        inert: button?.closest('[inert]') != null,
        focused: document.activeElement === button,
      };
    });
  expect(await state()).toEqual({inert: true, focused: false});
  await driver.tap(action);
  await driver.tap(message);
  await settle(page);
  expect(await readLog(page)).toEqual({clicks: [], taps: 0, toggles: []});
  await release(page);
  expect(await state()).toEqual({inert: false, focused: true});
  expect(await hitAt(page, action)).toBe('action');
  await driver.tap(message);
  await expect.poll(async () => (await readLog(page)).taps).toBe(1);
});

test('a light-dismissing popover stays open when a hold takes a tap outside it; after the release the same tap dismisses it', async ({
  page,
}) => {
  const driver = await load(page);
  await open(page, 'pop');
  const viewport = page.viewportSize();
  if (viewport == null) {
    throw new Error('no viewport');
  }
  const outside = {x: viewport.width / 2, y: viewport.height - 40};
  expect(await hitAt(page, outside)).toBe('under');
  await hold(page, 'pop', 'viewport');
  expect(await hitAt(page, outside)).toBe('shield:pop');
  await driver.tap(outside);
  await settle(page);
  expect(
    await page.evaluate(() =>
      document.getElementById('pop')?.matches(':popover-open'),
    ),
  ).toBe(true);
  expect(await readLog(page)).toEqual({
    clicks: [],
    taps: 0,
    toggles: ['pop:open'],
  });
  await release(page);
  await driver.tap(outside);
  await expect
    .poll(async () => (await readLog(page)).toggles)
    .toEqual(['pop:open', 'pop:closed']);
});

// A full-viewport layer whose root takes no hits itself and lets its tint
// and content take them (ContextMenu's lift layer is pointer-events: none):
// the shield, inside that root, must not inherit that.
for (const rootStyle of ['pointer-events: none', 'visibility: hidden']) {
  test(`a layer root with ${rootStyle} (its content opting back in) is held all the same: a tap reaches neither the content nor the page`, async ({
    page,
  }) => {
    const driver = await load(page);
    await page.evaluate(style => {
      const lift = document.getElementById('lift');
      if (lift != null) {
        lift.style.cssText += `; ${style}`;
      }
    }, rootStyle);
    await open(page, 'lift');
    const action = await centre(page, 'liftAction');
    const tint = {x: 12, y: 12};
    // Unheld, the content and the tint take the hits.
    expect(await hitAt(page, action)).toBe('liftAction');
    expect(await hitAt(page, tint)).toBe('tint');
    await hold(page, 'lift', 'layer');
    expect(await hitAt(page, action)).toBe('shield:lift');
    expect(await hitAt(page, tint)).toBe('shield:lift');
    await driver.tap(action);
    await driver.tap(tint);
    await settle(page);
    expect((await readLog(page)).clicks).toEqual([]);
    await release(page);
    expect(await hitAt(page, action)).toBe('liftAction');
  });
}

// Page zoom stays the browser's while a layer is held (spec:AST-094 FR10,
// FR18 and FR35; WCAG 1.4.4): the shield starts no pan, but a pinch on it
// still zooms the page.
for (const [id, scope] of [
  ['pop', 'viewport'],
  ['dialog', 'layer'],
] as const) {
  test(`while a ${scope === 'viewport' ? 'presentation' : 'dismissal'} holds ${id === 'pop' ? 'a popover' : 'a modal dialog'}, a one-finger pan scrolls nothing and a pinch still zooms the page; neither reaches the layer or the page`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'needs native scrolling and pinch-zoom from injected touches (Mobile Safari on the simulator)',
    );
    const driver = await load(page);
    const viewport = page.viewportSize();
    if (viewport == null) {
      throw new Error('no viewport');
    }
    const middle = {x: viewport.width / 2, y: viewport.height / 2};
    const panUp = drag(
      {x: middle.x, y: middle.y + 150},
      {x: middle.x, y: middle.y - 150},
      // A rest before the lift: no fling outlives the pan.
      {durationMs: 200, restMs: 150},
    );
    // A page that scrolls under the layer: unheld, the same pan scrolls it.
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '300vh';
      document.body.append(spacer);
    });
    await driver.play(panUp);
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await open(page, id);
    await hold(page, id, scope);
    expect(await hitAt(page, middle)).toBe(`shield:${id}`);
    await driver.play(panUp);
    await settle(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await driver.play(
      pinch({
        center: middle,
        fromDistance: 60,
        toDistance: 220,
        durationMs: 200,
      }),
    );
    await expect
      .poll(async () => page.evaluate(() => window.visualViewport?.scale ?? 1))
      .toBeGreaterThan(1.2);
    expect(await readLog(page)).toEqual({
      clicks: [],
      taps: 0,
      toggles: id === 'pop' ? ['pop:open'] : [],
    });
  });
}
