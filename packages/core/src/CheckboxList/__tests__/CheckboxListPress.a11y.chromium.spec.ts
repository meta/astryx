// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxListPress.a11y.chromium.spec.ts
 * @input The CheckboxList Default story in a built Storybook (a layered
 *   stylesheet) and real touch input through CDP
 * @output Real-engine proof that a finger on a CheckboxList row's label and on
 *   its box press the same surface and paint the same pixels. The box fades
 *   with the row on the lift. A pen on a fine-pointer page, a pressed
 *   ClickableCard and an outer row paint none of the box's press
 * @position Run with `pnpm test:a11y-contract`. Browser layer of the row's
 *   press surface; the jsdom layer is CheckboxList.test.tsx ("CheckboxListItem
 *   press surface").
 */

import {
  expect,
  test,
  type Browser,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {
  armHold,
  freezeTimers,
  installTimerGate,
  releaseAnimations,
  seekAnimations,
  thawTimers,
} from '@astryxdesign/interaction-harness';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

/** A phone: touch screen, primary pointer coarse. */
const PHONE = {
  viewport: {width: 402, height: 714},
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
} as const;

/** A mouse and a fine pointer: the `:active` path. */
const DESKTOP = {
  viewport: {width: 800, height: 600},
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
} as const;

/** Resolves after `n` animation frames have presented. */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    async count =>
      new Promise<void>(resolve => {
        const step = (left: number) => {
          if (left === 0) {
            resolve();
          } else {
            requestAnimationFrame(() => step(left - 1));
          }
        };
        step(count);
      }),
    n,
  );
}

/** How many animations run in the page, a press release included. */
async function running(page: Page): Promise<number> {
  return page.evaluate(() => document.getAnimations().length);
}

/**
 * Waits until nothing in the page animates. The two frames first let the
 * last input's style change start.
 */
async function untilStill(page: Page): Promise<void> {
  await frames(page, 2);
  await expect.poll(async () => running(page)).toBe(0);
  await frames(page, 2);
}

type RGB = [number, number, number];
type Point = {x: number; y: number};

interface Row {
  page: Page;
  close: () => Promise<void>;
  /** Where a finger lands on the label, and on the box. */
  label: Point;
  box: Point;
  /** Where the press is read: inside the box, and on the row clear of content. */
  boxSample: Point;
  rowSample: Point;
  press: (at: Point) => Promise<void>;
  lift: (at: Point) => Promise<void>;
}

async function openRow(
  browser: Browser,
  story: string,
  name: string,
  device: typeof PHONE | typeof DESKTOP = PHONE,
): Promise<Row> {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  const checkbox = page.getByRole('checkbox', {name});
  await checkbox.waitFor({state: 'attached'});
  const geometry = await checkbox.evaluate(input => {
    const row = input.closest('li');
    const box = row?.querySelector('.astryx-checkbox-indicator');
    const label = Array.from(row?.querySelectorAll('span') ?? []).find(
      span => span.children.length === 0 && span.textContent !== '',
    );
    if (row == null || box == null || label == null) {
      return null;
    }
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    };
    return {row: rect(row), box: rect(box), label: rect(label)};
  });
  if (geometry == null) {
    throw new Error(`${story} has no row for ${name}`);
  }
  const cdp = await context.newCDPSession(page);
  const {row, box, label} = geometry;
  return {
    page,
    close: async () => context.close(),
    label: {x: label.x + label.width / 2, y: label.y + label.height / 2},
    box: {x: box.x + box.width / 2, y: box.y + box.height / 2},
    boxSample: {x: box.x + box.width / 2, y: box.y + box.height - 5},
    rowSample: {x: row.x + row.width - 12, y: row.y + row.height / 2},
    press: async at => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{x: at.x, y: at.y, id: 1}],
      });
    },
    lift: async () => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    },
  };
}

/** The colour of a 2 × 2 CSS px patch, as presented. */
async function pixel(page: Page, at: Point): Promise<RGB> {
  const png = PNG.sync.read(
    await page.screenshot({
      clip: {
        x: Math.round(at.x) - 1,
        y: Math.round(at.y) - 1,
        width: 2,
        height: 2,
      },
      animations: 'allow',
      caret: 'hide',
    }),
  );
  const sum = [0, 0, 0];
  const count = png.width * png.height;
  for (let i = 0; i < count; i++) {
    sum[0] += png.data[i * 4];
    sum[1] += png.data[i * 4 + 1];
    sum[2] += png.data[i * 4 + 2];
  }
  return sum.map(value => Math.round(value / count)) as RGB;
}

/** Which element carries the press, described by its tag. */
async function pressedSurface(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const pressed = document.querySelector('[data-astryx-press]');
    return pressed == null ? null : pressed.tagName.toLowerCase();
  });
}

/** Waits until a press is painted: an element carries it, and nothing animates. */
async function untilPressed(page: Page): Promise<void> {
  await expect.poll(async () => pressedSurface(page)).not.toBeNull();
  await untilStill(page);
}

/** The press state a CheckboxList row carries, or null. */
async function rowPress(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      document
        .querySelector('li[data-astryx-press]')
        ?.getAttribute('data-astryx-press') ?? null,
  );
}

const darker = (a: RGB, b: RGB) => a.every((value, i) => value < b[i]);

/**
 * The alpha of the press paint over a row's box, as computed: 0 when the
 * layer paints no image.
 */
async function boxPaint(page: Page, name: string): Promise<number> {
  return page.getByRole('checkbox', {name}).evaluate(input => {
    const layer = input
      .closest('li')
      ?.querySelector('.astryx-checkbox-indicator')
      ?.parentElement?.parentElement;
    if (layer == null) {
      throw new Error('no layer over the box');
    }
    const image = getComputedStyle(layer, '::after').backgroundImage;
    const alphas = Array.from(
      image.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)|\/\s*([\d.]+)\s*\)/g),
      match => Number(match[1] ?? match[2]),
    );
    return alphas.length === 0 ? 0 : Math.max(...alphas);
  });
}

/** The opacity of the pressed row's own layer (Item's `::before`). */
async function layerOpacity(page: Page): Promise<number> {
  return page.evaluate(() => {
    const row = document.querySelector('li[data-astryx-press]');
    return row == null ? 0 : Number(getComputedStyle(row, '::before').opacity);
  });
}

interface PressRead {
  surface: string | null;
  box: RGB;
  row: RGB;
}

test.describe('CheckboxList row press', () => {
  test('a finger on the label and a finger on the box press the same surface and paint the same pixels', async ({
    browser,
  }) => {
    const reads = new Map<'label' | 'box', PressRead>();
    let rest: {box: RGB; row: RGB} | null = null;
    for (const where of ['label', 'box'] as const) {
      // A fresh page per press: the lift toggles the option.
      const row = await openRow(browser, 'core-checkboxlist--default', 'SMS');
      try {
        rest ??= {
          box: await pixel(row.page, row.boxSample),
          row: await pixel(row.page, row.rowSample),
        };
        await row.press(row[where]);
        await untilPressed(row.page);
        reads.set(where, {
          surface: await pressedSurface(row.page),
          box: await pixel(row.page, row.boxSample),
          row: await pixel(row.page, row.rowSample),
        });
        await row.lift(row[where]);
      } finally {
        await row.close();
      }
    }
    const onLabel = reads.get('label');
    const onBox = reads.get('box');
    if (rest == null || onLabel == null || onBox == null) {
      throw new Error('the presses were not read');
    }
    // One surface: the row itself, wherever the finger landed.
    expect(onLabel.surface).toBe('li');
    expect(onBox.surface).toBe('li');
    // The row and the box over it are both painted, the same either way.
    expect(darker(onLabel.row, rest.row)).toBe(true);
    expect(darker(onLabel.box, rest.box)).toBe(true);
    expect(onBox.row).toEqual(onLabel.row);
    expect(onBox.box).toEqual(onLabel.box);
  });

  test('a mouse press runs no touch press, and the label and the box keep their own :active paint', async ({
    browser,
  }) => {
    const reads = new Map<'label' | 'box', PressRead>();
    let rest: {box: RGB; row: RGB} | null = null;
    for (const where of ['label', 'box'] as const) {
      const row = await openRow(
        browser,
        'core-checkboxlist--default',
        'SMS',
        DESKTOP,
      );
      try {
        // A fine-pointer case proves nothing under a coarse primary pointer.
        expect(
          await row.page.evaluate(
            () => matchMedia('(pointer: coarse)').matches,
          ),
        ).toBe(false);
        rest ??= {
          box: await pixel(row.page, row.boxSample),
          row: await pixel(row.page, row.rowSample),
        };
        const at = row[where];
        await row.page.mouse.move(at.x, at.y);
        await row.page.mouse.down();
        await untilStill(row.page);
        reads.set(where, {
          surface: await pressedSurface(row.page),
          box: await pixel(row.page, row.boxSample),
          row: await pixel(row.page, row.rowSample),
        });
        await row.page.mouse.up();
      } finally {
        await row.close();
      }
    }
    const onLabel = reads.get('label');
    const onBox = reads.get('box');
    if (rest == null || onLabel == null || onBox == null) {
      throw new Error('the presses were not read');
    }
    // The touch press never runs for a mouse.
    expect(onLabel.surface).toBeNull();
    expect(onBox.surface).toBeNull();
    // Mouse hover and `:active`: on the label the row paints and the box
    // stays blank; on the box the box paints too.
    expect(darker(onLabel.row, rest.row)).toBe(true);
    expect(onLabel.box).toEqual(rest.box);
    expect(darker(onBox.box, rest.box)).toBe(true);
    expect(darker(onBox.row, rest.row)).toBe(true);
  });

  test('a pen on a fine-pointer page presses the box as a mouse does, never the row', async ({
    browser,
  }) => {
    // The row takes the press only under a coarse primary pointer. So on a
    // fine-pointer page a pen presses the box itself and shows only the box's
    // own `:active` paint. The row never paints a press.
    const row = await openRow(
      browser,
      'core-checkboxlist--default',
      'Email',
      DESKTOP,
    );
    try {
      expect(
        await row.page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const cdp = await row.page.context().newCDPSession(row.page);
      const send = async (type: string, pointerType: 'mouse' | 'pen') =>
        cdp.send('Input.dispatchMouseEvent', {
          type: type as 'mousePressed',
          x: row.box.x,
          y: row.box.y,
          button: 'left',
          buttons: type === 'mouseReleased' ? 0 : 1,
          clickCount: 1,
          pointerType,
        });
      const hold = async (pointerType: 'mouse' | 'pen'): Promise<RGB> => {
        await send('mouseMoved', pointerType);
        await send('mousePressed', pointerType);
        await untilStill(row.page);
        const read = await pixel(row.page, row.boxSample);
        await send('mouseReleased', pointerType);
        await untilStill(row.page);
        return read;
      };
      const rest = await pixel(row.page, row.boxSample);
      // Each hold toggles the box, so the mouse toggles it back once before
      // its own read: both reads see the same checked state.
      const pen = await hold('pen');
      await hold('mouse');
      const mouse = await hold('mouse');
      expect(darker(mouse, rest)).toBe(true);
      expect(pen).toEqual(mouse);
      // On a fine-pointer page a pen presses the box, never the row. So right
      // after a quick tap's lift, no row carries a press that would fade out.
      const tap = async (
        pointerType: 'mouse' | 'pen',
      ): Promise<string | null> => {
        await send('mouseMoved', pointerType);
        await send('mousePressed', pointerType);
        // A quick tap: the lift follows a few frames later.
        await frames(row.page, 4);
        await send('mouseReleased', pointerType);
        const left = await rowPress(row.page);
        await untilStill(row.page);
        return left;
      };
      // Each tap toggles the box, so the mouse taps twice: both reads see the
      // same checked state.
      const penTap = await tap('pen');
      await tap('mouse');
      const mouseTap = await tap('mouse');
      expect(penTap).toBeNull();
      expect(mouseTap).toBeNull();
    } finally {
      await row.close();
    }
  });

  test('a finger on a ClickableCard around the list leaves its boxes to the card', async ({
    browser,
  }) => {
    // The card's press is the card's own. Its overlay covers its content, so
    // a box under it shows the card's tint and no press paint of its own.
    const row = await openRow(
      browser,
      'core-checkboxlist--inside-clickable-card',
      'SMS',
    );
    try {
      const card = await row.page.evaluate(() => {
        const list = document.querySelector('#storybook-root ul');
        const surface = list?.parentElement?.closest('[data-astryx-pressable]');
        if (surface == null) {
          return null;
        }
        const r = surface.getBoundingClientRect();
        return {x: r.x + 6, y: r.y + 6};
      });
      if (card == null) {
        throw new Error('the story has no pressable card around the list');
      }
      const cardRest = await pixel(row.page, card);
      const boxRest = await pixel(row.page, row.boxSample);
      await row.press(card);
      await untilPressed(row.page);
      const surface = await pressedSurface(row.page);
      const cardHeld = await pixel(row.page, card);
      const boxHeld = await pixel(row.page, row.boxSample);
      await row.lift(card);
      expect(surface).not.toBe('li');
      expect(darker(cardHeld, cardRest)).toBe(true);
      // An unchecked box is the card's own surface colour at rest, so under
      // the card's tint alone it matches the card.
      expect(boxRest).toEqual(cardRest);
      expect(boxHeld).toEqual(cardHeld);
    } finally {
      await row.close();
    }
  });

  test("a list in a row's content keeps its boxes at rest while the outer row is held", async ({
    browser,
  }) => {
    // Each row hands its box its own press paint, so a box reads its nearest
    // row.
    const row = await openRow(
      browser,
      'core-checkboxlist--checkbox-list-in-row-content',
      'Email',
    );
    try {
      const inner = await row.page
        .getByRole('checkbox', {name: 'Work'})
        .evaluate(input => {
          const box = input
            .closest('li')
            ?.querySelector('.astryx-checkbox-indicator');
          if (box == null) {
            return null;
          }
          const r = box.getBoundingClientRect();
          return {x: r.x + r.width / 2, y: r.y + r.height - 5};
        });
      if (inner == null) {
        throw new Error('the story has no inner row');
      }
      const outerRest = await pixel(row.page, row.boxSample);
      const innerRest = await pixel(row.page, inner);
      await row.press(row.label);
      await untilPressed(row.page);
      const surface = await pressedSurface(row.page);
      const outerHeld = await pixel(row.page, row.boxSample);
      const innerHeld = await pixel(row.page, inner);
      await row.lift(row.label);
      expect(surface).toBe('li');
      expect(darker(outerHeld, outerRest)).toBe(true);
      expect(innerHeld).toEqual(innerRest);
    } finally {
      await row.close();
    }
  });

  test('holding the row leaves a checkbox in its content at rest', async ({
    browser,
  }) => {
    const row = await openRow(
      browser,
      'core-checkboxlist--checkbox-in-row-content',
      'Email',
    );
    try {
      const nested = await row.page
        .getByRole('checkbox', {name: 'Daily digest'})
        .evaluate(input => {
          const box = input.parentElement?.querySelector(
            '.astryx-checkbox-indicator',
          );
          if (box == null) {
            return null;
          }
          const r = box.getBoundingClientRect();
          return {x: r.x + r.width / 2, y: r.y + r.height - 5};
        });
      if (nested == null) {
        throw new Error('the nested checkbox has no box');
      }
      const rest = {
        box: await pixel(row.page, row.boxSample),
        nested: await pixel(row.page, nested),
      };
      await row.press(row.label);
      await untilPressed(row.page);
      const held = {
        surface: await pressedSurface(row.page),
        box: await pixel(row.page, row.boxSample),
        nested: await pixel(row.page, nested),
      };
      await row.lift(row.label);
      // The row owns the press and paints its own box…
      expect(held.surface).toBe('li');
      expect(darker(held.box, rest.box)).toBe(true);
      // …and the checkbox in its content keeps its own press: at rest.
      expect(held.nested).toEqual(rest.nested);
    } finally {
      await row.close();
    }
  });

  test('the box fades with the row when the finger lifts', async ({
    browser,
  }) => {
    const row = await openRow(browser, 'core-checkboxlist--default', 'SMS');
    try {
      const {page} = row;
      // Gate the page's timers before the press, so the controller's end of
      // the release can be held while the release is seeked.
      await installTimerGate(page);
      await row.press(row.label);
      await untilPressed(page);
      const held = await boxPaint(page, 'SMS');
      // The page holds the release itself as soon as it runs. A hold the test
      // sends after the lift arrives later on a busy machine, and the release
      // can end first.
      const pressed = page.locator('li[data-astryx-press]');
      const hold = await armHold(page, pressed, {
        judges: {
          target: pressed,
          property: 'opacity',
          pseudoElement: '::before',
        },
      });
      await row.lift(row.label);
      await freezeTimers(page);
      expect(await rowPress(page)).toBe('fading');
      const animations = await hold.held();
      // The checkbox's state transitions can join the hold. The release is the
      // row's CSS animations.
      const release = animations.filter(
        a => a.target?.startsWith('li') && a.kind === 'CSSAnimation',
      );
      expect(release.length, JSON.stringify(animations)).toBeGreaterThan(0);
      const releaseMs = Math.max(...release.map(a => a.durationMs));
      await seekAnimations(page, releaseMs / 2);
      const mid = {
        box: await boxPaint(page, 'SMS'),
        layer: await layerOpacity(page),
      };
      await releaseAnimations(page, {finish: true});
      await thawTimers(page);
      expect(held).toBeGreaterThan(0);
      // Half way through the release the row's layer is part way out…
      expect(mid.layer).toBeGreaterThan(0.05);
      expect(mid.layer).toBeLessThan(0.95);
      // …and the box has faded by the same share: its alpha is the overlay's
      // alpha times the strength, on the layer's clock and curve. The bound
      // covers the engine's rounding of the alpha it serializes.
      expect(
        Math.abs(mid.box / held - mid.layer),
        JSON.stringify({held, mid}),
      ).toBeLessThanOrEqual(0.02);
      await expect.poll(async () => rowPress(page)).toBeNull();
      expect(await boxPaint(page, 'SMS')).toBe(0);
    } finally {
      await row.close();
    }
  });
});
