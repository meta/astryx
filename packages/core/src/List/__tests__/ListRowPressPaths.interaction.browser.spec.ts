// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListRowPressPaths.interaction.browser.spec.ts
 * @input The built List "Interactive" and Press Feedback "Rows" stories, the
 *   interaction harness, and the release clock (the default theme's
 *   `--duration-exit`)
 * @output The row press paths beside the main release proofs. A press the
 *   browser takes for a scroll drops the highlight at once: the press
 *   controller's cancel, unchanged by the compositor layer. Reduce Motion
 *   keeps the fade, which is not a movement. A mouse press and hover on a
 *   fine pointer leave the press layer out of it. A row held and released
 *   between two divided rows keeps both dividers visible through its tint.
 * @position Interaction evidence for the row press layer
 *   (privateAttributes/press.stylex.ts `rowPressLayerStyles.cell`), beside
 *   ListRowPress.interaction.browser.spec.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  armHold,
  drag,
  openStory,
  releaseAnimations,
  seekAnimations,
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';

const storybook = withStorybook(test);

/** The release clock where the press paints: the theme's `--duration-exit`, ms. */
async function exitMsOf(surface: Locator): Promise<number> {
  return surface.evaluate(el => {
    const time = getComputedStyle(el)
      .getPropertyValue('--duration-exit')
      .trim();
    return time.endsWith('ms') ? parseFloat(time) : parseFloat(time) * 1000;
  });
}

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

/**
 * A row's bottom divider: its computed border and the pixels of the strip it
 * draws across the row (inset from the rounded ends), decoded.
 */
async function dividerOf(page: Page, row: Locator) {
  const border = await row.evaluate(el => {
    const style = getComputedStyle(el);
    return {
      width: Number.parseFloat(style.borderBottomWidth),
      style: style.borderBottomStyle,
      color: style.borderBottomColor,
    };
  });
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  const strip = async (top: number) =>
    page.screenshot({
      clip: {x: box.x + 12, y: top, width: box.width - 24, height: 1},
    });
  const pixels = PNG.sync.read(
    await strip(box.y + box.height - border.width),
  ) as {width: number; height: number; data: Uint8Array};
  const inside = PNG.sync.read(
    await strip(box.y + box.height - border.width - 4),
  ) as {data: Uint8Array};
  return {border, pixels: pixels.data, inside: inside.data};
}

/** A row's surface just inside its top and bottom edges, decoded. */
async function surfacesOf(page: Page, row: Locator) {
  const box = await row.boundingBox();
  const width = await row.evaluate(el =>
    Number.parseFloat(getComputedStyle(el).borderBottomWidth),
  );
  if (box == null) {
    throw new Error('no row');
  }
  const strip = async (top: number) =>
    (
      PNG.sync.read(
        await page.screenshot({
          clip: {x: box.x + 12, y: top, width: box.width - 24, height: 1},
        }),
      ) as {data: Uint8Array}
    ).data;
  return {
    top: await strip(box.y + 2),
    bottom: await strip(box.y + box.height - width - 4),
  };
}

/** A decoded strip's per-channel median. */
function medianOf(data: Uint8Array): [number, number, number] {
  const channel = (offset: number) => {
    const values: number[] = [];
    for (let i = offset; i < data.length; i += 4) {
      values.push(data[i]);
    }
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return [channel(0), channel(1), channel(2)];
}

/** The contrast between two decoded strips' median colors. */
function contrastOf(a: Uint8Array, b: Uint8Array): number {
  const luminance = ([r, g, bl]: [number, number, number]) => {
    const linear = (value: number) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(bl);
  };
  const [light, dark] = [luminance(medianOf(a)), luminance(medianOf(b))].sort(
    (x, y) => y - x,
  );
  return (light + 0.05) / (dark + 0.05);
}

/** The largest channel difference between two decoded strips. */
function largestDifference(a: Uint8Array, b: Uint8Array): number {
  let largest = a.length === b.length ? 0 : 255;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    largest = Math.max(largest, Math.abs(a[i] - b[i]));
  }
  return largest;
}

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
  // The page holds the release itself as soon as it runs. A hold the test
  // sends after the lift arrives later on a busy machine, and the release
  // can end first.
  const hold = await armHold(page, row, {
    judges: {target: row, property: 'opacity', pseudoElement: '::before'},
  });
  await driver.play(
    tap({x: box.x + box.width / 2, y: box.y + box.height / 2}, {holdMs: 300}),
  );
  const releaseMs = await exitMsOf(row);
  await hold.held();
  await seekAnimations(page, 0);
  expect(await layerOpacity(row)).toBeCloseTo(1, 2);
  await seekAnimations(page, releaseMs / 2);
  const midway = await layerOpacity(row);
  expect(midway).toBeGreaterThan(0.05);
  expect(midway).toBeLessThan(0.95);
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => layerOpacity(row)).toBe(0);
});

test('under a finger, a row held and released between two divided rows keeps both dividers visible through its tint, by computed border and contrast', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-list--interactive', {
    hasDividers: '!true',
  });
  await touchOnly(page);
  const driver = await touchDriver(page);
  const row = (label: string) =>
    page.locator('[data-astryx-pressable]').filter({hasText: label}).first();
  const above = row('Inbox');
  const pressed = row('Sent');
  await expect(pressed).toBeVisible();
  // At rest: both dividers drawn, and their strips differ from the row's
  // own surface just inside them, so a strip that matches later is a drawn
  // divider, not a blank.
  const atRest = {
    above: await dividerOf(page, above),
    pressed: await dividerOf(page, pressed),
  };
  for (const divider of Object.values(atRest)) {
    expect(divider.border.width).toBeGreaterThan(0);
    expect(divider.border.style).toBe('solid');
    expect(divider.border.color).not.toMatch(/^rgba\(.*,\s*0\)$/);
    expect(largestDifference(divider.pixels, divider.inside)).toBeGreaterThan(
      8,
    );
  }
  /**
   * Each divider as drawn at rest. It keeps its computed border, and it
   * stands out from the pressed row's surface beside it as it did at rest.
   * The row before's divider sits against the pressed row's top, and its own
   * divider against the pressed row's bottom.
   */
  const restSurface = await surfacesOf(page, pressed);
  const expectDividersAsAtRest = async (phase: string) => {
    const surface = await surfacesOf(page, pressed);
    for (const [name, target, side] of [
      ['above', above, 'top'],
      ['pressed', pressed, 'bottom'],
    ] as const) {
      const now = await dividerOf(page, target);
      expect(now.border, `${phase}: ${name}`).toEqual(atRest[name].border);
      const rest = contrastOf(atRest[name].pixels, restSurface[side]);
      const pressedContrast = contrastOf(now.pixels, surface[side]);
      expect(
        Math.abs(pressedContrast - rest),
        `${phase}: ${name}'s divider reads ${pressedContrast.toFixed(2)}:1 beside the pressed row, ${rest.toFixed(2)}:1 at rest`,
      ).toBeLessThanOrEqual(0.05);
    }
  };
  const box = await pressed.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  // Armed before the press, so the page holds the release as it starts.
  const hold = await armHold(page, pressed, {
    judges: {target: pressed, property: 'opacity', pseudoElement: '::before'},
  });
  // Held: checked while the finger is still down, after the first event.
  await driver.play(
    tap({x: box.x + box.width / 2, y: box.y + box.height / 2}, {holdMs: 600}),
    {
      onEvent: async (_step, index) => {
        if (index !== 0) {
          return;
        }
        await expect.poll(async () => pressState(pressed)).toBe('on');
        await expectDividersAsAtRest('held');
      },
    },
  );
  // Released: halfway through the release fade.
  const releaseMs = await exitMsOf(pressed);
  await hold.held();
  await seekAnimations(page, releaseMs / 2);
  expect(await pressState(pressed)).toBe('fading');
  await expectDividersAsAtRest('releasing');
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => pressState(pressed)).toBeNull();
  await expectDividersAsAtRest('after the release');
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

test('a radio row under a finger paints its circle’s press, and keeps its bare look: no row layer, and the stacking context its touch band needs', async ({
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
      isolation: getComputedStyle(el).isolation,
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
  // Only the circle paints, as with a mouse: the row has no layer. Under a
  // finger an interactive row isolates, so its touch band sits below its
  // content (component:List FR11).
  expect(look.layer).toBe('none');
  expect(look.isolation).toBe('isolate');
});

test('under a finger, a row at rest keeps its own ::before look and isolates for its touch band; the press layer takes the ::before only while pressed', async ({
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
  // Under a finger an interactive row isolates, so its touch band sits below
  // its content (component:List FR11). A mouse keeps "auto".
  const own = {
    content: '"•"',
    opacity: '1',
    position: 'static',
    zIndex: 'auto',
    pointerEvents: 'auto',
    isolation: 'isolate',
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
