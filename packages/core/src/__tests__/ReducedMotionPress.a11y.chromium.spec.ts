// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Button core/ClickableCard core/SelectableCard core/Thumbnail ^packages/core/src/(motion/reducedMotion|utils/interactionOverlay)

/**
 * @file ReducedMotionPress.a11y.chromium.spec.ts
 * @input The Button Secondary story and the ClickableCard, SelectableCard
 *   and Thumbnail stories in a built Storybook. Emulated
 *   `prefers-reduced-motion: reduce`, and real mouse and touch input through
 *   CDP.
 * @output Real-engine proof that Button and the cards follow
 *   `design:reduced-motion`. A press never scales a button (DR1). With a fine
 *   primary pointer their state changes are immediate (DR3). On a touch screen
 *   their colors change at once, and only opacity fades, on the exit tokens
 *   within 200 ms. A card's press release fades on the exit tokens on every
 *   pointer, and a mouse's timing is unchanged.
 * @position Run with `pnpm test:a11y-contract`. Browser layer of the
 *   reduced-motion arms in Button.tsx and the cards' overlays.
 */

import {
  expect,
  test,
  type Browser,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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
  reducedMotion: 'reduce',
} as const;
/** A desktop: primary pointer fine. */
const DESKTOP = {
  viewport: {width: 1024, height: 768},
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  reducedMotion: 'reduce',
} as const;
/** The same desktop and phone with Reduce Motion off. */
const DESKTOP_MOTION = {...DESKTOP, reducedMotion: 'no-preference'} as const;
const PHONE_MOTION = {...PHONE, reducedMotion: 'no-preference'} as const;
type Device =
  typeof PHONE | typeof DESKTOP | typeof PHONE_MOTION | typeof DESKTOP_MOTION;

const BUTTON = 'core-button--secondary';
const CARDS = [
  ['ClickableCard', 'core-clickablecard--with-on-click', 0],
  // The second card: the first starts selected.
  ['SelectableCard', 'core-selectablecard--single-select', 1],
  ['Thumbnail', 'core-thumbnail--clickable', 0],
] as const;
const SURFACE = '#storybook-root [data-astryx-pressable]';

async function open(
  browser: Browser,
  device: Device,
  story: string,
): Promise<{page: Page; close: () => Promise<void>}> {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  // Remote demo media never loads here; the styles under test do not need it.
  await page.route(
    url => url.origin !== storybook.origin,
    async route => route.abort(),
  );
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.locator(SURFACE).first().waitFor();
  // Each case runs on the device it claims: a coarse primary pointer for the
  // phone, a fine one for the desktop. Reduce Motion is as the device sets it.
  const media = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  expect(media).toEqual({
    coarse: device.hasTouch,
    reduce: device.reducedMotion === 'reduce',
  });
  await page.mouse.move(1, 1);
  return {page, close: async () => context.close()};
}

/** The element's transform, as the engine resolved it ('none' or a matrix). */
async function transformOf(page: Page, index = 0): Promise<string> {
  return page
    .locator(SURFACE)
    .nth(index)
    .evaluate(element => getComputedStyle(element).transform);
}

const isIdentity = (transform: string) =>
  transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';

/** `0.175s`, `0s`, `175ms` → ms; a list resolves to its longest. */
const longestMs = (value: string) =>
  Math.max(
    ...value.split(',').map(part => {
      const match = part.trim().match(/^([\d.]+)(ms|s)$/);
      return match == null
        ? Number.NaN
        : Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    }),
  );

/** Every transition duration on the element and its overlay, in ms. */
async function transitionsOf(
  page: Page,
  index: number,
): Promise<{element: number; overlay: number}> {
  return page
    .locator(SURFACE)
    .nth(index)
    .evaluate(element => ({
      element: getComputedStyle(element).transitionDuration,
      overlay: getComputedStyle(element, '::after').transitionDuration,
    }))
    .then(({element, overlay}) => ({
      element: longestMs(element),
      overlay: longestMs(overlay),
    }));
}

/** A duration token and a curve token as the page resolves them. */
async function tokensOf(
  page: Page,
  durationToken: string,
  curveToken: string,
): Promise<{duration: number; curve: string}> {
  const read = await page.evaluate(
    ([durationName, curveName]) => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('div');
      probe.style.transitionDuration = root
        .getPropertyValue(durationName)
        .trim();
      probe.style.transitionTimingFunction = root
        .getPropertyValue(curveName)
        .trim();
      document.body.append(probe);
      const probed = getComputedStyle(probe);
      const result = {
        duration: probed.transitionDuration,
        curve: probed.transitionTimingFunction,
      };
      probe.remove();
      return result;
    },
    [durationToken, curveToken] as const,
  );
  return {duration: longestMs(read.duration), curve: read.curve};
}

/** The overlay's transition duration (ms) and curve. */
async function overlayTimingOf(
  page: Page,
  index: number,
): Promise<{duration: number; curve: string}> {
  const read = await page
    .locator(SURFACE)
    .nth(index)
    .evaluate(element => {
      const overlay = getComputedStyle(element, '::after');
      return {
        duration: overlay.transitionDuration,
        curve: overlay.transitionTimingFunction,
      };
    });
  return {duration: longestMs(read.duration), curve: read.curve};
}

/**
 * The touch press release's clock (ms) and curve on the element the press
 * controller writes to, read while it carries the release's attribute.
 */
async function releaseTimingOf(
  page: Page,
  index: number,
): Promise<{duration: number; curve: string}> {
  const read = await page
    .locator(SURFACE)
    .nth(index)
    .evaluate(element => {
      element.setAttribute('data-astryx-press', 'fading');
      const style = getComputedStyle(element);
      const result = {
        duration: style.animationDuration,
        curve: style.animationTimingFunction,
      };
      element.removeAttribute('data-astryx-press');
      return result;
    });
  return {duration: longestMs(read.duration), curve: read.curve};
}

/**
 * The properties that animate, with a duration above 0, on the element and
 * its `::after` overlay. A shorter duration list repeats, as in CSS.
 */
async function animatedPropertiesOf(
  page: Page,
  index: number,
): Promise<{element: string[]; overlay: string[]}> {
  return page
    .locator(SURFACE)
    .nth(index)
    .evaluate(element => {
      const animated = (style: CSSStyleDeclaration) => {
        const properties = style.transitionProperty
          .split(',')
          .map(part => part.trim());
        const durations = style.transitionDuration
          .split(',')
          .map(part => part.trim());
        return properties.filter((property, at) => {
          const duration = durations[at % durations.length] ?? '0s';
          return property !== 'none' && Number.parseFloat(duration) > 0;
        });
      };
      return {
        element: animated(getComputedStyle(element)),
        overlay: animated(getComputedStyle(element, '::after')),
      };
    });
}

test('a pressed button never scales under reduced motion, with a mouse or a finger (DR1)', async ({
  browser,
}) => {
  const desktop = await open(browser, DESKTOP, BUTTON);
  try {
    const box = await desktop.page.locator(SURFACE).first().boundingBox();
    if (box == null) {
      throw new Error('the Button story rendered no button');
    }
    await desktop.page.mouse.move(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    await desktop.page.mouse.down();
    const pressed = await transformOf(desktop.page);
    await desktop.page.mouse.up();
    expect(isIdentity(pressed), pressed).toBe(true);
  } finally {
    await desktop.close();
  }

  const phone = await open(browser, PHONE, BUTTON);
  try {
    const box = await phone.page.locator(SURFACE).first().boundingBox();
    if (box == null) {
      throw new Error('the Button story rendered no button');
    }
    const cdp = await phone.page.context().newCDPSession(phone.page);
    const point = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{...point, id: 1}],
    });
    await expect
      .poll(async () =>
        phone.page.locator(SURFACE).first().getAttribute('data-astryx-press'),
      )
      .toBe('on');
    const pressed = await transformOf(phone.page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    expect(isIdentity(pressed), pressed).toBe(true);
  } finally {
    await phone.close();
  }
});

test('with a fine primary pointer, a button’s and a card’s state changes are immediate under reduced motion (DR3)', async ({
  browser,
}) => {
  const button = await open(browser, DESKTOP, BUTTON);
  try {
    expect((await transitionsOf(button.page, 0)).element).toBe(0);
  } finally {
    await button.close();
  }
  for (const [name, story, index] of CARDS) {
    const card = await open(browser, DESKTOP, story);
    try {
      const {element, overlay} = await transitionsOf(card.page, index);
      expect(overlay, `${name} overlay`).toBe(0);
      if (name !== 'Thumbnail') {
        expect(element, `${name} border`).toBe(0);
      }
    } finally {
      await card.close();
    }
  }
});

test('on a touch screen under reduced motion, a button changes at once and a card cross-fades opacity alone, on the exit tokens within 200 ms (DR2, Button FR15)', async ({
  browser,
}) => {
  const button = await open(browser, PHONE, BUTTON);
  try {
    // Button keeps its transitions instant under reduced motion on every
    // pointer (its record's FR15).
    expect((await transitionsOf(button.page, 0)).element).toBe(0);
    expect(await animatedPropertiesOf(button.page, 0)).toEqual({
      element: [],
      overlay: [],
    });
  } finally {
    await button.close();
  }
  for (const [name, story, index] of CARDS) {
    const card = await open(browser, PHONE, story);
    try {
      // Only opacity may animate, on the card and on its overlay.
      const {element, overlay} = await animatedPropertiesOf(card.page, index);
      expect(element, `${name} element`).toEqual(
        element.length === 0 ? [] : ['opacity'],
      );
      expect(overlay, `${name} overlay`).toEqual(['opacity']);
      // Its fade keeps the exit tokens, within 200 ms.
      const exit = await tokensOf(card.page, '--duration-exit', '--ease-exit');
      expect(exit.duration, 'exit token').toBeGreaterThan(0);
      const timing = await overlayTimingOf(card.page, index);
      expect(timing.duration, name).toBe(Math.min(exit.duration, 200));
      expect(timing.curve, name).toBe(exit.curve);
      // So does a finger's press release.
      const release = await releaseTimingOf(card.page, index);
      expect(release.duration, `${name} release`).toBe(
        Math.min(exit.duration, 200),
      );
      expect(release.curve, `${name} release`).toBe(exit.curve);
    } finally {
      await card.close();
    }
  }
});

test('on a touch screen under reduced motion, selecting a SelectableCard runs only opacity transitions (DR2)', async ({
  browser,
}) => {
  const [, story, index] = CARDS[1];
  const card = await open(browser, PHONE, story);
  try {
    await card.page.locator(SURFACE).nth(index).tap();
    const transitions = await card.page.evaluate(() =>
      document
        .getAnimations()
        .filter(
          (animation): animation is CSSTransition =>
            animation instanceof CSSTransition,
        )
        .map(animation => animation.transitionProperty),
    );
    expect(transitions.filter(property => property !== 'opacity')).toEqual([]);
  } finally {
    await card.close();
  }
});

test('under a coarse primary pointer, a card’s press release fades on the exit tokens', async ({
  browser,
}) => {
  for (const [name, story, index] of CARDS) {
    const card = await open(browser, PHONE_MOTION, story);
    try {
      // The press controller writes the release's attribute on this element.
      const surface = card.page.locator(SURFACE).nth(index);
      await surface.evaluate(element => {
        (window as unknown as {pressSeen: string[]}).pressSeen = [];
        new MutationObserver(() => {
          (window as unknown as {pressSeen: string[]}).pressSeen.push(
            element.getAttribute('data-astryx-press') ?? 'none',
          );
        }).observe(element, {attributeFilter: ['data-astryx-press']});
      });
      await surface.tap();
      await expect
        .poll(async () =>
          card.page.evaluate(
            () => (window as unknown as {pressSeen: string[]}).pressSeen,
          ),
        )
        .toContain('fading');
      const exit = await tokensOf(card.page, '--duration-exit', '--ease-exit');
      expect(exit.duration, 'exit token').toBeGreaterThan(0);
      const release = await releaseTimingOf(card.page, index);
      expect(release.duration, name).toBe(exit.duration);
      expect(release.curve, name).toBe(exit.curve);
    } finally {
      await card.close();
    }
  }
});

test('with a fine primary pointer, a card’s mouse timing is unchanged, and a finger’s release fades on the exit tokens', async ({
  browser,
}) => {
  for (const [name, story, index] of CARDS) {
    const card = await open(browser, DESKTOP_MOTION, story);
    try {
      const surface = card.page.locator(SURFACE).nth(index);
      const box = await surface.boundingBox();
      expect(box, `${name} box`).not.toBeNull();
      if (box == null) {
        continue;
      }
      // A mouse's press fades in and out on the fast duration and the
      // standard curve, as before.
      const fast = await tokensOf(
        card.page,
        '--duration-fast',
        '--ease-standard',
      );
      expect(fast.duration, 'fast token').toBeGreaterThan(0);
      expect(
        await overlayTimingOf(card.page, index),
        `${name} at rest`,
      ).toEqual(fast);
      await card.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await card.page.mouse.down();
      try {
        expect(
          await overlayTimingOf(card.page, index),
          `${name} pressed`,
        ).toEqual(fast);
      } finally {
        await card.page.mouse.up();
      }
      // A finger's release on this desktop fades on the exit tokens too.
      const exit = await tokensOf(card.page, '--duration-exit', '--ease-exit');
      expect(exit.duration, 'exit token').toBeGreaterThan(0);
      expect(await releaseTimingOf(card.page, index), name).toEqual(exit);
    } finally {
      await card.close();
    }
  }
});
