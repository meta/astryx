// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListRowPressPaths.interaction.browser.spec.ts
 * @input The built List "Interactive" and Press Feedback "Rows" stories, the
 *   interaction harness, and the cell release clock (motion/uikit/list.ts)
 * @output The row press paths beside the main release proofs: a press the
 *   browser takes for a scroll drops the highlight at once (the press
 *   controller's cancel, unchanged by the compositor layer); Reduce
 *   Motion keeps the fade (a fade, not a movement); a mouse press and hover on
 *   a fine pointer leave the press layer out of it
 * @position Interaction evidence for the row press layer
 *   (utils/rowPressLayer.ts `rowPressLayerStyles.cell`), beside
 *   ListRowPress.interaction.browser.spec.ts
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  drag,
  holdAnimations,
  openStory,
  releaseAnimations,
  seekAnimations,
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {list} from '../../motion/uikit/list';

const storybook = withStorybook(test);

const RELEASE_MS: number = list.highlight.releaseMs;

/** The press layer's strength: 0 while the row has no layer box (at rest). */
const layerOpacity = async (row: Locator) =>
  row.evaluate(el => {
    const before = getComputedStyle(el, '::before');
    return before.content === 'none' || before.content === 'normal'
      ? 0
      : Number(before.opacity);
  });

const pressState = async (row: Locator) =>
  row.evaluate(el => el.getAttribute('data-astryx-press'));

async function touchOnly(page: Page) {
  const touch = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  test.skip(!touch, 'the press layer serves a touch screen');
}

test("a press the browser takes for a scroll drops the highlight at once (the controller's cancel, unchanged)", async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-press-feedback-touch--rows');
  await touchOnly(page);
  const driver = await touchDriver(page);
  const row = page
    .locator('[data-astryx-pressable]')
    .filter({hasText: 'Conversation 2'})
    .first();
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  // Every press state the controller writes, and every animation the row's
  // layer starts, with page times.
  await row.evaluate(el => {
    const log: string[] = [];
    (window as unknown as {__pressLog: string[]}).__pressLog = log;
    new MutationObserver(() =>
      log.push(`press:${el.getAttribute('data-astryx-press')}`),
    ).observe(el, {attributeFilter: ['data-astryx-press']});
    el.addEventListener('animationstart', event =>
      log.push(`start:${(event as AnimationEvent).pseudoElement}`),
    );
  });
  const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  // Held long enough for the highlight to show, then a vertical pan the
  // scroller takes: the browser cancels the touch for the page.
  await driver.play(
    drag(from, {x: from.x, y: from.y - 80}, {holdMs: 300, durationMs: 160}),
  );
  await expect.poll(async () => pressState(row)).toBeNull();
  const log = await page.evaluate(
    () => (window as unknown as {__pressLog: string[]}).__pressLog,
  );
  // Highlighted while held, then the scroll's cancel removes it outright:
  // no release fade starts, and the row is at rest.
  expect(log, JSON.stringify(log)).toContain('press:on');
  expect(log.at(-1), JSON.stringify(log)).toBe('press:null');
  expect(log, JSON.stringify(log)).not.toContain('press:fading');
  expect(log, JSON.stringify(log)).not.toContain('start:::before');
  expect(await layerOpacity(row)).toBe(0);
});

test('Reduce Motion keeps the release fade: a fade, not a movement', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await openStory(page, storybook(), 'core-list--interactive');
  await touchOnly(page);
  const driver = await touchDriver(page);
  const row = page
    .locator('[data-astryx-pressable]')
    .filter({hasText: 'Sent'})
    .first();
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  await driver.play(
    tap({x: box.x + box.width / 2, y: box.y + box.height / 2}, {holdMs: 300}),
  );
  await holdAnimations(page);
  await seekAnimations(page, 0);
  expect(await layerOpacity(row)).toBeCloseTo(1, 2);
  await seekAnimations(page, RELEASE_MS / 2);
  const midway = await layerOpacity(row);
  expect(midway).toBeGreaterThan(0.05);
  expect(midway).toBeLessThan(0.95);
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => layerOpacity(row)).toBe(0);
});

test('a mouse press and hover on a fine pointer leave the press layer out of it', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 1024, height: 768},
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  try {
    await openStory(page, storybook(), 'core-list--interactive');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const fine = await page.evaluate(
      () => matchMedia('(pointer: fine)').matches,
    );
    expect(fine).toBe(true);
    const row = page
      .locator('[data-astryx-pressable]')
      .filter({hasText: 'Sent'})
      .first();
    const box = await row.boundingBox();
    if (box == null) {
      throw new Error('no row');
    }
    // No layer at all with a fine pointer: hovering, pressing and lifting
    // never give the row a `::before` box.
    const layer = async () =>
      row.evaluate(el => getComputedStyle(el, '::before').content);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    expect(await layer()).toBe('none');
    await page.mouse.down();
    expect(await pressState(row)).toBeNull();
    expect(await layer()).toBe('none');
    await page.mouse.up();
    expect(await pressState(row)).toBeNull();
    expect(await layer()).toBe('none');
  } finally {
    await context.close();
  }
});

test('a fine pointer: a row is as it was, with no press layer and no stacking context (desktop unchanged)', async ({
  browser,
}) => {
  // AST-017 FR59/DEC-25: touch work leaves a fine pointer's rows as they were. The
  // press layer and the stacking context it needs exist under a finger only,
  // so a caller's own `::before` and z-index behave as before.
  const context = await browser.newContext({
    viewport: {width: 1024, height: 768},
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  try {
    const rowBox = async (story: string, selector: string, label: string) => {
      await openStory(page, storybook(), story);
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const row = page.locator(selector).filter({hasText: label}).first();
      await expect(row).toBeVisible();
      return row.evaluate(el => ({
        before: getComputedStyle(el, '::before').content,
        isolation: getComputedStyle(el).isolation,
      }));
    };
    expect(
      await rowBox('core-list--interactive', '[data-astryx-pressable]', 'Sent'),
    ).toEqual({before: 'none', isolation: 'auto'});
    // A row's own `::before` is exactly as its author wrote it: nothing of
    // the layer (its opacity, stacking, hit testing) reaches it.
    const own = await page
      .locator('[data-astryx-pressable]')
      .filter({hasText: 'Sent'})
      .first()
      .evaluate(el => {
        const style = document.createElement('style');
        style.textContent =
          '[data-test-own]::before{content:"•";position:static;opacity:1}';
        document.head.append(style);
        el.setAttribute('data-test-own', '');
        const before = getComputedStyle(el, '::before');
        return {
          content: before.content,
          opacity: before.opacity,
          position: before.position,
          zIndex: before.zIndex,
          pointerEvents: before.pointerEvents,
        };
      });
    expect(own).toEqual({
      content: '"•"',
      opacity: '1',
      position: 'static',
      zIndex: 'auto',
      pointerEvents: 'auto',
    });
    expect(
      await rowBox(
        'core-treelist--interactive',
        '#storybook-root [role="treeitem"] [data-astryx-pressable]',
        'Settings',
      ),
    ).toEqual({before: 'none', isolation: 'auto'});
  } finally {
    await context.close();
  }
});

test('a radio row under a finger paints its circle’s press, and keeps its bare look: no row layer', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'the held touch is driven with Chromium touch events (CDP)',
  );
  await openStory(page, storybook(), 'core-radiolist--default');
  await touchOnly(page);
  const row = page.locator('#storybook-root [data-astryx-pressable]').first();
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  // On the label, away from the circle: the row takes the press.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: box.x + box.width * 0.6, y: box.y + box.height / 2}],
  });
  await expect.poll(async () => pressState(row)).toBe('on');
  const look = await row.evaluate(el => {
    const wrapper = [...el.querySelectorAll('*')].find(
      child =>
        child.querySelector(':scope > input[type="radio"]') != null &&
        getComputedStyle(child, '::after').content !== 'none',
    );
    return {
      circle:
        wrapper == null
          ? null
          : getComputedStyle(wrapper, '::after').backgroundImage,
      layer: getComputedStyle(el, '::before').content,
    };
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  // The circle's own press paint: the pressed token, not a transparent
  // gradient.
  expect(look.circle).toMatch(/gradient/);
  expect(look.circle).not.toMatch(
    /^linear-gradient\(rgba\(0, 0, 0, 0\), rgba\(0, 0, 0, 0\)\)$/,
  );
  // Only the circle paints, as with a mouse: the row has no layer.
  expect(look.layer).toBe('none');
});

test('under a finger, a row at rest is as it was: its own ::before keeps its look and it is no stacking context; the press layer takes the ::before only while pressed', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'the held touch is driven with Chromium touch events (CDP)',
  );
  await openStory(page, storybook(), 'core-list--interactive');
  await touchOnly(page);
  const row = page
    .locator('[data-astryx-pressable]')
    .filter({hasText: 'Sent'})
    .first();
  await expect(row).toBeVisible();
  const look = async () =>
    row.evaluate(el => {
      const before = getComputedStyle(el, '::before');
      return {
        content: before.content,
        opacity: before.opacity,
        position: before.position,
        zIndex: before.zIndex,
        pointerEvents: before.pointerEvents,
        isolation: getComputedStyle(el).isolation,
      };
    });
  // A caller's own decoration on the row's `::before` (a page rule beats
  // the components' layered styles for what it sets; the rest is theirs).
  await row.evaluate(el => {
    const style = document.createElement('style');
    style.textContent = '[data-test-own]::before{content:"•"}';
    document.head.append(style);
    el.setAttribute('data-test-own', '');
  });
  const own = {
    content: '"•"',
    opacity: '1',
    position: 'static',
    zIndex: 'auto',
    pointerEvents: 'auto',
    isolation: 'auto',
  };
  expect(await look()).toEqual(own);
  // A press: the layer takes the `::before`, in its own stacking context.
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: box.x + box.width / 2, y: box.y + box.height / 2}],
  });
  await expect.poll(async () => pressState(row)).toBe('on');
  // The layer's box (with the caller's content), painted, in its own
  // stacking context.
  const pressed = await look();
  expect(pressed.content).toBe('"•"');
  expect(pressed.position).toBe('absolute');
  expect(pressed.zIndex).toBe('-1');
  expect(pressed.opacity).toBe('1');
  expect(pressed.isolation).toBe('isolate');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  // The press over, the row's own decoration is back as it was.
  await expect.poll(async () => pressState(row)).toBeNull();
  expect(await look()).toEqual(own);
});
