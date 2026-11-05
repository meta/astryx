// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CircleCheckIndicator.interaction.browser.spec.ts
 * @input The built Lab CircleCheckIndicator "Mapped Checkbox List" story, in
 *   which a theme maps the circle to `checkbox`. Real touch input (Chromium
 *   CDP, WebKit's tap) and the interaction harness drive it.
 * @output Proofs that a finger and a mouse both fade the circle over the
 *   theme's duration. Under Reduce Motion both change it at once.
 *   A storyboard shows a tap's blended frames. The row keeps its checkbox
 *   semantics.
 * @position Real-engine layer of CircleCheckIndicator; the stylesheet layer
 *   is circleCheck.test.tsx
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  castStoryboard,
  frames,
  openStory,
  startScreencast,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'lab-circlecheckindicator--mapped-checkbox-list';

/** What the page saw in the microtask after the circle's class changed. */
interface CircleRead {
  first: string;
  transitions: {property: string; duration: number}[];
}

/** The circle of the row labelled `name`. */
const CIRCLE = '.astryx-circle-check-indicator';

async function watchCircle(page: Page, name: string): Promise<void> {
  await page.getByRole('checkbox', {name}).evaluate(
    (input, {selector, key}) => {
      const circle = input
        .closest('li, .astryx-item')
        ?.querySelector<HTMLElement>(selector);
      if (circle == null) {
        throw new Error(`no circle for ${key}`);
      }
      const reads = ((
        window as unknown as Record<string, unknown>
      ).__circleMarkReads ??= {}) as Record<string, unknown>;
      const observer = new MutationObserver(() => {
        if (reads[key] != null) {
          return;
        }
        reads[key] = {
          first: getComputedStyle(circle).backgroundColor,
          transitions: circle
            .getAnimations()
            .filter(animation => 'transitionProperty' in animation)
            .map(animation => ({
              property: (animation as CSSTransition).transitionProperty,
              duration: Number(animation.effect?.getTiming().duration ?? 0),
            })),
        };
        observer.disconnect();
      });
      observer.observe(circle, {attributes: true, attributeFilter: ['class']});
    },
    {selector: CIRCLE, key: name},
  );
}

async function readCircle(page: Page, name: string): Promise<CircleRead> {
  await page.waitForFunction(
    key =>
      ((window as unknown as Record<string, Record<string, unknown>>)
        .__circleMarkReads ?? {})[key] != null,
    name,
  );
  return page.evaluate(
    key =>
      (window as unknown as Record<string, Record<string, CircleRead>>)
        .__circleMarkReads[key],
    name,
  );
}

async function circleColour(page: Page, name: string): Promise<string> {
  return page.getByRole('checkbox', {name}).evaluate((input, selector) => {
    const circle = input.closest('li, .astryx-item')?.querySelector(selector);
    if (circle == null) {
      throw new Error('no circle');
    }
    return getComputedStyle(circle).backgroundColor;
  }, CIRCLE);
}

/** How many animations the circle of the row labelled `name` runs. */
async function runningOn(page: Page, name: string): Promise<number> {
  return page.getByRole('checkbox', {name}).evaluate((input, selector) => {
    const circle = input.closest('li, .astryx-item')?.querySelector(selector);
    if (circle == null) {
      throw new Error('no circle');
    }
    return circle.getAnimations().length;
  }, CIRCLE);
}

/**
 * Waits until the circle runs no animation. The two frames first let the
 * last input's transition start.
 */
async function untilStill(page: Page, name: string): Promise<void> {
  await frames(page, 2);
  await expect.poll(() => runningOn(page, name)).toBe(0);
}

/** The circle's colour once it is still, held for two more frames. */
async function settledColour(page: Page, name: string): Promise<string> {
  await untilStill(page, name);
  const colour = await circleColour(page, name);
  await frames(page, 2);
  expect(await circleColour(page, name), 'two frames later').toBe(colour);
  return colour;
}

/** The centre of the circle of the row labelled `name`: a mouse there is on the checkbox. */
async function circleCentreOf(page: Page, name: string) {
  const box = await page
    .getByRole('checkbox', {name})
    .evaluate((input, selector) => {
      const circle = input.closest('li, .astryx-item')?.querySelector(selector);
      if (circle == null) {
        throw new Error('no circle');
      }
      const r = circle.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    }, CIRCLE);
  return {x: Math.round(box.x), y: Math.round(box.y)};
}

async function centreOf(page: Page, name: string) {
  const box = await page.getByRole('checkbox', {name}).evaluate(input => {
    const row = input.closest('li, .astryx-item');
    if (row == null) {
      throw new Error('no row');
    }
    const r = row.getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  });
  return {x: Math.round(box.x), y: Math.round(box.y)};
}

/** The circle's background on every animation frame for `ms`. */
async function traceCircle(
  page: Page,
  name: string,
  ms: number,
): Promise<{t: number; colour: string}[]> {
  return page.getByRole('checkbox', {name}).evaluate(
    async (input, {selector, ms}) => {
      const circle = input.closest('li, .astryx-item')?.querySelector(selector);
      if (circle == null) {
        throw new Error('no circle');
      }
      const samples: {t: number; colour: string}[] = [];
      const end = performance.now() + ms;
      return new Promise<{t: number; colour: string}[]>(resolve => {
        const tick = () => {
          samples.push({
            t: Date.now(),
            colour: getComputedStyle(circle).backgroundColor,
          });
          if (performance.now() < end) {
            requestAnimationFrame(tick);
          } else {
            resolve(samples);
          }
        };
        requestAnimationFrame(tick);
      });
    },
    {selector: CIRCLE, ms},
  );
}

test.describe('CircleCheckIndicator under a finger', () => {
  // One touch model on every touch device: a coarse primary pointer. The
  // touch page here is the engine's own touch emulation; real iOS Safari and
  // Android Chrome are the simulator and emulator recordings.

  test('a tap fades the circle over the theme’s duration, and the row stays a checkbox', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await watchCircle(page, 'Mountains');
    const driver = await touchDriver(page);
    await driver.tap(await centreOf(page, 'Mountains'));
    await expect(page.getByRole('checkbox', {name: 'Mountains'})).toBeChecked();
    const read = await readCircle(page, 'Mountains');
    expect(
      read.transitions.some(
        ({property, duration}) =>
          property === 'background-color' && duration > 0,
      ),
    ).toBe(true);
    expect(read.first).not.toBe(await settledColour(page, 'Mountains'));
  });

  test('a tap’s fade, filmed: the transition runs from the start colour @storyboard', async ({
    page,
  }, testInfo) => {
    await openStory(page, storybook(), STORY);
    const driver = await touchDriver(page);
    const at = await centreOf(page, 'Mountains');
    const before = await circleColour(page, 'Mountains');
    await watchCircle(page, 'Mountains');
    const cast = await startScreencast(page);
    await frames(page, 4);
    const tapAt = Date.now();
    const [trace] = await Promise.all([
      traceCircle(page, 'Mountains', 500),
      driver.tap(at),
    ]);
    const shot = await cast.stop();
    const after = trace.at(-1)?.colour;
    const nearest = (t: number) =>
      trace.reduce((best, sample) =>
        Math.abs(sample.t - t) < Math.abs(best.t - t) ? sample : best,
      );
    // The evidence is written first, so a failing run shows its blend.
    const storyboard = await castStoryboard(page, shot, {
      name: 'circle-check-tap',
      zero: tapAt,
      cellScale: 0.5,
      columns: 4,
      data: t => ({circle: nearest(t).colour}),
    });
    await storyboard.write(testInfo, {
      claim:
        'under a finger the circle fades in over the theme duration, as with a mouse',
      before,
      after,
    });
    expect(after).not.toBe(before);
    // The frames are evidence only: a busy main thread can skip every blended
    // frame. The transition itself is read from the first style after the change.
    const read = await readCircle(page, 'Mountains');
    expect(
      read.transitions.some(
        ({property, duration}) =>
          property === 'background-color' && duration > 0,
      ),
    ).toBe(true);
    expect(read.first).toBe(before);
  });

  test('a mouse fades the circle the same way', async ({browser}) => {
    const context = await browser.newContext({
      viewport: {width: 1024, height: 768},
      hasTouch: false,
      isMobile: false,
    });
    const page = await context.newPage();
    try {
      await openStory(page, storybook(), STORY);
      // A fine-pointer case proves nothing under a coarse primary pointer.
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      await watchCircle(page, 'Mountains');
      const at = await centreOf(page, 'Mountains');
      await page.mouse.move(at.x, at.y);
      await untilStill(page, 'Mountains');
      await page.mouse.click(at.x, at.y);
      const read = await readCircle(page, 'Mountains');
      expect(
        read.transitions.some(
          ({property, duration}) =>
            property === 'background-color' && duration > 0,
        ),
      ).toBe(true);
      await untilStill(page, 'Mountains');
      expect(read.first).not.toBe(await circleColour(page, 'Mountains'));
    } finally {
      await context.close();
    }
  });
});

test.describe('CircleCheckIndicator under Reduce Motion', () => {
  test('a finger changes the circle at once', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openStory(page, storybook(), STORY);
    await watchCircle(page, 'Mountains');
    const driver = await touchDriver(page);
    await driver.tap(await centreOf(page, 'Mountains'));
    await expect(page.getByRole('checkbox', {name: 'Mountains'})).toBeChecked();
    const read = await readCircle(page, 'Mountains');
    expect(read.transitions).toEqual([]);
    expect(read.first).toBe(await settledColour(page, 'Mountains'));
  });

  test('a mouse changes at once (design:reduced-motion DR3)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 1024, height: 768},
      hasTouch: false,
      isMobile: false,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await openStory(page, storybook(), STORY);
      // A fine-pointer case proves nothing under a coarse primary pointer.
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      await watchCircle(page, 'Mountains');
      const at = await circleCentreOf(page, 'Mountains');
      await page.mouse.move(at.x, at.y);
      await untilStill(page, 'Mountains');
      await page.mouse.click(at.x, at.y);
      await expect(
        page.getByRole('checkbox', {name: 'Mountains'}),
      ).toBeChecked();
      const read = await readCircle(page, 'Mountains');
      expect(read.transitions).toEqual([]);
      expect(read.first).toBe(await circleColour(page, 'Mountains'));
    } finally {
      await context.close();
    }
  });
});

/** The host's press layer and the circle's own, while the row is pressed. */
async function readPress(page: Page, name: string) {
  return page.getByRole('checkbox', {name}).evaluate((input, selector) => {
    const wrapper = input.parentElement;
    const circle = input
      .closest('li, .astryx-item')
      ?.querySelector<HTMLElement>(selector);
    if (wrapper == null || circle == null) {
      throw new Error('no circle');
    }
    const host = getComputedStyle(wrapper, '::after');
    const own = getComputedStyle(circle, '::after');
    return {
      hostContent: host.content,
      circleContent: own.content,
      circleImage: own.backgroundImage,
      circleColour: own.backgroundColor,
      circleLayerRadius: own.borderRadius,
      circleRadius: getComputedStyle(circle).borderRadius,
    };
  }, CIRCLE);
}

/** Whether the list row that holds the named checkbox carries a press. */
async function rowPressed(page: Page, name: string): Promise<boolean> {
  return page
    .getByRole('checkbox', {name})
    .evaluate(
      input => input.closest('li')?.hasAttribute('data-astryx-press') ?? false,
    );
}

test.describe('CircleCheckIndicator press', () => {
  test('a held circle presses the row and paints round; the host’s square layer stays off', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const at = await circleCentreOf(page, 'Mountains');
    const driver = await touchDriver(page);
    // At rest the circle paints no press image.
    const rest = await readPress(page, 'Mountains');
    let read: Awaited<ReturnType<typeof readPress>> | null = null;
    let pressedRow = false;
    await driver.play(
      [
        {t: 0, fingers: [{id: 1, ...at}]},
        {t: 600, fingers: []},
      ],
      {
        onEvent: async step => {
          if (step.type !== 'touchStart') {
            return;
          }
          // The press paints after the content-touch delay, inside the hold.
          await expect
            .poll(
              async () => {
                read = await readPress(page, 'Mountains');
                return read.circleImage;
              },
              {timeout: 500},
            )
            .not.toBe(rest.circleImage);
          pressedRow = await rowPressed(page, 'Mountains');
        },
      },
    );
    if (read == null) {
      throw new Error('the press was not read');
    }
    const held: Awaited<ReturnType<typeof readPress>> = read;
    // Under a finger the row is the one press surface; the circle paints it.
    expect(pressedRow).toBe(true);
    expect(held.hostContent).toBe('none');
    expect(held.circleContent).not.toBe('none');
    expect(held.circleImage).not.toBe(rest.circleImage);
    expect(held.circleLayerRadius).toBe(held.circleRadius);
  });

  test('a held label presses the row, and the circle paints with it', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const at = await centreOf(page, 'Mountains');
    const driver = await touchDriver(page);
    const rest = await readPress(page, 'Mountains');
    let held: Awaited<ReturnType<typeof readPress>> | null = null;
    await driver.play(
      [
        {t: 0, fingers: [{id: 1, ...at}]},
        {t: 600, fingers: []},
      ],
      {
        onEvent: async step => {
          if (step.type !== 'touchStart') {
            return;
          }
          // The row's own press proves the hold landed. The circle is read then.
          await expect
            .poll(async () => rowPressed(page, 'Mountains'), {timeout: 500})
            .toBe(true);
          held = await readPress(page, 'Mountains');
        },
      },
    );
    if (held == null) {
      throw new Error('the hold was not read');
    }
    const read: Awaited<ReturnType<typeof readPress>> = held;
    // The row hands its own checkbox the press, wherever the finger lands, and
    // the circle paints it round while the host's square layer stays off.
    expect(read.circleImage).not.toBe(rest.circleImage);
    expect(read.circleContent).not.toBe('none');
    expect(read.hostContent).toBe('none');
  });

  test('a mouse press tints the circle, not a square around it', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 1024, height: 768},
      hasTouch: false,
      isMobile: false,
    });
    const page = await context.newPage();
    try {
      await openStory(page, storybook(), STORY);
      // A fine-pointer case proves nothing under a coarse primary pointer.
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const at = await circleCentreOf(page, 'Mountains');
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      const held = await readPress(page, 'Mountains');
      await page.mouse.up();
      expect(held.hostContent).toBe('none');
      expect(held.circleColour).not.toBe('rgba(0, 0, 0, 0)');
      expect(held.circleLayerRadius).toBe(held.circleRadius);
    } finally {
      await context.close();
    }
  });

  test('a mouse hovering the checkbox tints the circle', async ({browser}) => {
    const context = await browser.newContext({
      viewport: {width: 1024, height: 768},
      hasTouch: false,
      isMobile: false,
    });
    const page = await context.newPage();
    try {
      await openStory(page, storybook(), STORY);
      // A fine-pointer case proves nothing under a coarse primary pointer.
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const ring = async () =>
        page
          .getByRole('checkbox', {name: 'Mountains'})
          .evaluate(
            (input, selector) =>
              getComputedStyle(
                input
                  .closest('li, .astryx-item')
                  ?.querySelector(selector) as Element,
              ).boxShadow,
            CIRCLE,
          );
      await page.mouse.move(1, 1);
      const rest = await ring();
      const at = await circleCentreOf(page, 'Mountains');
      await page.mouse.move(at.x, at.y);
      await expect.poll(ring).not.toBe(rest);
    } finally {
      await context.close();
    }
  });
});

test.describe('CircleCheckIndicator in forced colors', () => {
  test('the ring falls back to a 1px system-coloured border, and the check stays visible', async ({
    page,
  }) => {
    /** The circle and check of the first row whose checkbox is `checked`. */
    const read = async (checked: boolean) =>
      page.evaluate(
        ({want, circleSelector}) => {
          const input = Array.from(
            document.querySelectorAll<HTMLInputElement>(
              '#storybook-root input[type="checkbox"]',
            ),
          ).find(el => el.checked === want);
          const row = input?.closest('li, .astryx-item');
          const circle = row?.querySelector<HTMLElement>(circleSelector);
          const check = row?.querySelector<SVGElement>(
            '.astryx-circle-check-indicator-check',
          );
          if (circle == null || check == null) {
            return null;
          }
          const ring = getComputedStyle(circle);
          const mark = getComputedStyle(check);
          return {
            borderStyle: ring.borderTopStyle,
            borderWidth: ring.borderTopWidth,
            boxShadow: ring.boxShadow,
            checkDisplay: mark.display,
            checkVisibility: mark.visibility,
          };
        },
        {want: checked, circleSelector: CIRCLE},
      );
    await openStory(page, storybook(), STORY);
    // Default: the empty circle's ring is the inset shadow, with no border.
    const normal = await read(false);
    expect(normal).not.toBeNull();
    expect(normal?.borderStyle).toBe('none');
    expect(normal?.boxShadow).toContain('inset');
    // Forced colors drops shadows: the ring comes back as a 1px border.
    await page.emulateMedia({forcedColors: 'active'});
    const forced = await read(false);
    expect(forced?.borderStyle).toBe('solid');
    expect(forced?.borderWidth).toBe('1px');
    // A checked circle still shows its check.
    const checked = await read(true);
    expect(checked).not.toBeNull();
    expect(checked?.checkDisplay).not.toBe('none');
    expect(checked?.checkVisibility).toBe('visible');
  });
});
