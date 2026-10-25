// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CardPress.a11y.chromium.spec.ts
 * @input The ClickableCard, SelectableCard and Thumbnail stories in a built
 *   Storybook (a layered stylesheet), real touch input through CDP and a
 *   real mouse
 * @output Real-engine proof that a finger's press on a card paints the
 *   pressed overlay a desktop mouse press paints and fades at the lift, and
 *   that where a fine pointer's `:active` also matches under the finger the
 *   press is painted once, not twice
 * @position Run with `pnpm test:a11y-contract`. Browser layer of the cards'
 *   press overlay; the jsdom layer is each card's own test and
 *   utils/customPropertyArmLayering.test.ts.
 *
 * Storybook builds StyleX with cascade layers, where a custom property's
 * own declaration outranks every attribute arm of it, so this is where a
 * press painted through such an arm stays invisible.
 */

import {
  expect,
  test,
  type Browser,
  type CDPSession,
  type Page,
} from '@playwright/test';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

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
/** A desktop: primary pointer fine. */
const DESKTOP = {
  viewport: {width: 1024, height: 768},
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
} as const;

type RGB = [number, number, number];
type Point = {x: number; y: number};

interface Surface {
  name: string;
  story: string;
  /** Which marked pressable of the story to press. */
  index: number;
  /** Where to read the overlay, from the surface's box: clear of content. */
  sample: (box: {width: number; height: number}) => Point;
}

const SURFACES: Surface[] = [
  {
    name: 'ClickableCard',
    story: 'core-clickablecard--with-on-click',
    index: 0,
    sample: box => ({x: box.width - 24, y: 8}),
  },
  {
    // The second card: the first starts selected.
    name: 'SelectableCard',
    story: 'core-selectablecard--single-select',
    index: 1,
    sample: box => ({x: box.width - 24, y: 8}),
  },
  {
    name: 'Thumbnail',
    story: 'core-thumbnail--clickable',
    index: 0,
    sample: box => ({x: box.width / 2, y: box.height / 2}),
  },
];

/** A flat grey stand-in for remote demo media, so every run reads the same pixels. */
const GREY_PNG = ((): Buffer => {
  const png = new PNG({width: 8, height: 8});
  png.data.fill(128);
  for (let i = 3; i < png.data.length; i += 4) {
    png.data[i] = 255;
  }
  return PNG.sync.write(png);
})();

interface Opened {
  page: Page;
  /** One session per page: CDP keeps a touch's state per session. */
  cdp: CDPSession;
  close: () => Promise<void>;
  /** The press point and the overlay sample point, in page coordinates. */
  center: Point;
  sample: Point;
}

async function open(
  browser: Browser,
  device: typeof PHONE | typeof DESKTOP,
  surface: Surface,
): Promise<Opened> {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  await page.route(
    url => url.origin !== storybook.origin,
    async route => {
      if (route.request().resourceType() === 'image') {
        await route.fulfill({contentType: 'image/png', body: GREY_PNG});
      } else {
        await route.abort();
      }
    },
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=${surface.story}&viewMode=story`,
  );
  const element = page
    .locator('#storybook-root [data-astryx-pressable]')
    .nth(surface.index);
  await element.waitFor();
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images, async image =>
        image.decode().catch(() => {}),
      ),
    );
  });
  // The press is the subject, not the activation: keep a selection from
  // toggling and a link from navigating, so the release reads the rest pixel.
  await page.evaluate(() => {
    document.addEventListener('click', event => event.preventDefault(), true);
  });
  const box = await element.boundingBox();
  if (box == null) {
    throw new Error(`${surface.name} rendered no pressable surface`);
  }
  await page.mouse.move(1, 1);
  const sample = surface.sample(box);
  return {
    page,
    cdp: await context.newCDPSession(page),
    close: async () => context.close(),
    center: {x: box.x + box.width / 2, y: box.y + box.height / 2},
    sample: {x: box.x + sample.x, y: box.y + sample.y},
  };
}

/** The mean colour of a 2 × 2 CSS px patch, as presented. */
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

/** The pixel once two reads a frame apart agree (transitions finished). */
async function steadyPixel(page: Page, at: Point): Promise<RGB> {
  let last = await pixel(page, at);
  for (let tries = 0; tries < 40; tries++) {
    await page.waitForTimeout(50);
    const next = await pixel(page, at);
    if (next.every((value, channel) => value === last[channel])) {
      return next;
    }
    last = next;
  }
  return last;
}

async function pressAttribute(opened: Opened, surface: Surface) {
  return opened.page
    .locator('#storybook-root [data-astryx-pressable]')
    .nth(surface.index)
    .getAttribute('data-astryx-press');
}

function expectSameColour(actual: RGB, expected: RGB): void {
  for (let channel = 0; channel < 3; channel++) {
    expect(
      Math.abs(actual[channel] - expected[channel]),
      `${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`,
    ).toBeLessThanOrEqual(2);
  }
}

async function touch(
  opened: Opened,
  type: 'touchStart' | 'touchEnd',
): Promise<void> {
  await opened.cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints:
      type === 'touchStart'
        ? [{x: opened.center.x, y: opened.center.y, id: 1}]
        : [],
  });
}

/** Forces (or releases) `:active` on the surface through DevTools. */
async function forceActive(
  opened: Opened,
  surface: Surface,
  on: boolean,
): Promise<void> {
  const {root} = await opened.cdp.send('DOM.getDocument', {depth: 0});
  const {nodeIds} = await opened.cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: '#storybook-root [data-astryx-pressable]',
  });
  await opened.cdp.send('CSS.enable');
  await opened.cdp.send('CSS.forcePseudoState', {
    nodeId: nodeIds[surface.index],
    forcedPseudoClasses: on ? ['active'] : [],
  });
}

/** What a desktop mouse press paints on the surface: the reference. */
async function desktopPress(
  browser: Browser,
  surface: Surface,
): Promise<{rest: RGB; pressed: RGB}> {
  const desktop = await open(browser, DESKTOP, surface);
  try {
    const rest = await steadyPixel(desktop.page, desktop.sample);
    await desktop.page.mouse.move(desktop.center.x, desktop.center.y);
    await desktop.page.mouse.down();
    const pressed = await steadyPixel(desktop.page, desktop.sample);
    await desktop.page.mouse.up();
    return {rest, pressed};
  } finally {
    await desktop.close();
  }
}

for (const surface of SURFACES) {
  test(`${surface.name}: a finger's press paints what a desktop press paints, then fades at the lift`, async ({
    browser,
  }) => {
    const reference = await desktopPress(browser, surface);
    expect(reference.pressed).not.toEqual(reference.rest);

    const phone = await open(browser, PHONE, surface);
    try {
      const rest = await steadyPixel(phone.page, phone.sample);
      expectSameColour(rest, reference.rest);

      await touch(phone, 'touchStart');
      await phone.page.waitForTimeout(250);
      expect(await pressAttribute(phone, surface)).toBe('on');
      expectSameColour(
        await steadyPixel(phone.page, phone.sample),
        reference.pressed,
      );

      await touch(phone, 'touchEnd');
      expect(await pressAttribute(phone, surface)).toBe('fading');
      await expect.poll(async () => pressAttribute(phone, surface)).toBeNull();
      expectSameColour(await steadyPixel(phone.page, phone.sample), rest);
    } finally {
      await phone.close();
    }
  });

  test(`${surface.name}: a desktop mouse is unchanged: hover, \`:active\`, release, leave`, async ({
    browser,
  }) => {
    const desktop = await open(browser, DESKTOP, surface);
    try {
      const rest = await steadyPixel(desktop.page, desktop.sample);
      await desktop.page.mouse.move(desktop.center.x, desktop.center.y);
      const hover = await steadyPixel(desktop.page, desktop.sample);
      await desktop.page.mouse.down();
      const pressed = await steadyPixel(desktop.page, desktop.sample);
      // A fine pointer's press is `:active` alone: the controller writes nothing.
      expect(await pressAttribute(desktop, surface)).toBeNull();
      await desktop.page.mouse.up();
      const released = await steadyPixel(desktop.page, desktop.sample);
      await desktop.page.mouse.move(1, 1);
      const left = await steadyPixel(desktop.page, desktop.sample);
      expect(hover).not.toEqual(rest);
      expect(pressed).not.toEqual(hover);
      expectSameColour(released, hover);
      expectSameColour(left, rest);
    } finally {
      await desktop.close();
    }
  });

  test(`${surface.name}: \`:active\` beside the controller's press paints it once`, async ({
    browser,
  }) => {
    const reference = await desktopPress(browser, surface);
    // A touchscreen beside a fine pointer: the primary pointer stays fine, so
    // the mouse arms are live, and a real finger also matches `:active` on
    // such a device while the controller paints. CDP touch input does not
    // set `:active`, so DevTools forces it for the length of the press.
    const laptop = await open(browser, DESKTOP, surface);
    try {
      expect(
        await laptop.page.evaluate(() => matchMedia('(pointer: fine)').matches),
      ).toBe(true);
      await touch(laptop, 'touchStart');
      await laptop.page.waitForTimeout(250);
      expect(await pressAttribute(laptop, surface)).toBe('on');
      await forceActive(laptop, surface, true);
      expectSameColour(
        await steadyPixel(laptop.page, laptop.sample),
        reference.pressed,
      );
      await forceActive(laptop, surface, false);
      await touch(laptop, 'touchEnd');
    } finally {
      await laptop.close();
    }
  });
}
