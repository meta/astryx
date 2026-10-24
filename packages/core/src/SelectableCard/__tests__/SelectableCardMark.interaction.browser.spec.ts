// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardMark.interaction.browser.spec.ts
 * @input The built SelectableCard Single Select story, real touch input
 *   (Chromium CDP / WebKit's tap) and the interaction harness
 * @output Proofs that under a finger a card's ring and border change in the
 *   frame the selection lands. This holds on the card that gains the
 *   selection and on the one that loses it. No transition is created. Every
 *   animation frame of a tap shows each card wholly selected or wholly not
 *   (storyboard). A mouse keeps the theme's transition (the negative
 *   control).
 * @position Real-engine layer of SelectableCard's touch mark timing; the
 *   stylesheet layer is SelectableCard/SelectableCardMark.test.tsx
 */

import {expect, test, type Page} from '@playwright/test';
import {
  castStoryboard,
  frames,
  openStory,
  startScreencast,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-selectablecard--single-select';

/** A card's mark: its border colour and its shadow (which carries the ring). */
interface Mark {
  border: string;
  shadow: string;
}

/** What the page saw in the microtask after the card's class changed. */
interface CardRead extends Mark {
  /** Transitions on the card right after that computation. */
  transitions: {property: string; duration: number}[];
}

/**
 * Watches the card labelled `name`. When React writes its new state, the
 * observer runs as a microtask, before any frame. It computes the card's
 * style once and records the mark and any transition it started.
 */
async function watchCard(page: Page, name: string): Promise<void> {
  await page.getByRole('checkbox', {name}).evaluate((input, key) => {
    const card = input.closest<HTMLElement>('.astryx-selectable-card');
    if (card == null) {
      throw new Error(`no card for ${key}`);
    }
    const reads = ((window as unknown as Record<string, unknown>).__c06cards ??=
      {}) as Record<string, unknown>;
    const observer = new MutationObserver(() => {
      if (reads[key] != null) {
        return;
      }
      const style = getComputedStyle(card);
      reads[key] = {
        border: style.borderTopColor,
        shadow: style.boxShadow,
        transitions: card
          .getAnimations()
          .filter(animation => 'transitionProperty' in animation)
          .map(animation => ({
            property: (animation as CSSTransition).transitionProperty,
            duration: Number(animation.effect?.getTiming().duration ?? 0),
          })),
      };
      observer.disconnect();
    });
    observer.observe(card, {attributes: true, attributeFilter: ['class']});
  }, name);
}

async function readCard(page: Page, name: string): Promise<CardRead> {
  await page.waitForFunction(
    key =>
      ((window as unknown as Record<string, Record<string, unknown>>)
        .__c06cards ?? {})[key] != null,
    name,
  );
  return page.evaluate(
    key =>
      (window as unknown as Record<string, Record<string, CardRead>>)
        .__c06cards[key],
    name,
  );
}

/** The card's mark, and how many animations it and its layers run. */
async function readCardNow(
  page: Page,
  name: string,
): Promise<{mark: Mark; running: number}> {
  return page.getByRole('checkbox', {name}).evaluate(input => {
    const card = input.closest('.astryx-selectable-card');
    if (card == null) {
      throw new Error('no card');
    }
    const style = getComputedStyle(card);
    return {
      mark: {border: style.borderTopColor, shadow: style.boxShadow},
      running: card.getAnimations({subtree: true}).length,
    };
  });
}

/**
 * Waits until the card runs no animation. The two frames first let the
 * last input's transition start.
 */
async function untilCardStill(page: Page, name: string): Promise<void> {
  await frames(page, 2);
  await expect
    .poll(async () => (await readCardNow(page, name)).running)
    .toBe(0);
}

/** The card's mark once it is still, held for two more frames. */
async function settledMark(page: Page, name: string): Promise<Mark> {
  await untilCardStill(page, name);
  const {mark} = await readCardNow(page, name);
  await frames(page, 2);
  expect((await readCardNow(page, name)).mark, 'two frames later').toEqual(
    mark,
  );
  return mark;
}

/**
 * Samples both cards' marks on every animation frame for `ms`, stamped with
 * the epoch time the screencast uses.
 */
async function traceMarks(
  page: Page,
  names: ReadonlyArray<string>,
  ms: number,
): Promise<{t: number; marks: Record<string, Mark>}[]> {
  return page.evaluate(
    async ({names, ms}) =>
      new Promise(resolve => {
        const cards = names.map(name => {
          const input = [
            ...document.querySelectorAll<HTMLInputElement>(
              'input[type=checkbox]',
            ),
          ].find(el => el.getAttribute('aria-label') === name);
          const card = input?.closest('.astryx-selectable-card');
          if (card == null) {
            throw new Error(`no card for ${name}`);
          }
          return [name, card] as const;
        });
        const samples: {t: number; marks: Record<string, Mark>}[] = [];
        const end = performance.now() + ms;
        const tick = () => {
          const marks: Record<string, Mark> = {};
          for (const [name, card] of cards) {
            const style = getComputedStyle(card);
            marks[name] = {
              border: style.borderTopColor,
              shadow: style.boxShadow,
            };
          }
          samples.push({t: Date.now(), marks});
          if (performance.now() < end) {
            requestAnimationFrame(tick);
          } else {
            resolve(samples);
          }
        };
        requestAnimationFrame(tick);
      }),
    {names, ms},
  );
}

async function centreOf(page: Page, name: string) {
  const box = await page.getByRole('checkbox', {name}).evaluate(input => {
    const card = input.closest('.astryx-selectable-card');
    if (card == null) {
      throw new Error('no card');
    }
    const r = card.getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  });
  return {x: Math.round(box.x), y: Math.round(box.y)};
}

test.describe('SelectableCard selection mark under a finger', () => {
  // One touch model on every touch device: a coarse primary pointer. The
  // touch page here is the engine's own touch emulation; real iOS Safari and
  // Android Chrome are the simulator and emulator recordings.

  test('a tap changes the ring and the border in the frame the selection lands, on both cards', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await watchCard(page, 'Pro');
    await watchCard(page, 'Basic');
    const driver = await touchDriver(page);
    await driver.tap(await centreOf(page, 'Pro'));
    for (const name of ['Pro', 'Basic']) {
      const read = await readCard(page, name);
      expect(read.transitions, name).toEqual([]);
      const settled = await settledMark(page, name);
      expect(read.border, name).toBe(settled.border);
      expect(read.shadow, name).toBe(settled.shadow);
    }
    await expect(page.getByRole('checkbox', {name: 'Pro'})).toBeChecked();
  });

  test('every frame of a tap shows each card wholly selected or wholly not @storyboard', async ({
    page,
  }, testInfo) => {
    await openStory(page, storybook(), STORY);
    const driver = await touchDriver(page);
    const at = await centreOf(page, 'Pro');
    const before = (await traceMarks(page, ['Pro', 'Basic'], 50)).at(-1);
    if (before == null) {
      throw new Error('no resting sample');
    }
    const cast = await startScreencast(page);
    await frames(page, 4);
    const tapAt = Date.now();
    const [trace] = await Promise.all([
      traceMarks(page, ['Pro', 'Basic'], 500),
      driver.tap(at),
    ]);
    const shot = await cast.stop();
    const after = trace.at(-1);
    if (after == null) {
      throw new Error('no samples');
    }
    const nearest = (t: number) =>
      trace.reduce((best, sample) =>
        Math.abs(sample.t - t) < Math.abs(best.t - t) ? sample : best,
      );
    // The evidence is written first, so a failing run shows its blend.
    const storyboard = await castStoryboard(page, shot, {
      name: 'selectable-card-mark-tap',
      zero: tapAt,
      cellScale: 0.5,
      columns: 4,
      data: t => ({
        pro: nearest(t).marks.Pro.border,
        basic: nearest(t).marks.Basic.border,
      }),
    });
    await storyboard.write(testInfo, {
      claim:
        'under a finger a card’s ring and border change in one frame (motion/uikit/selection.ts)',
      before: before.marks,
      after: after.marks,
    });
    expect(after.marks.Pro.border).not.toBe(before.marks.Pro.border);
    for (const name of ['Pro', 'Basic']) {
      for (const sample of trace) {
        const mark = sample.marks[name];
        const whole =
          (mark.border === before.marks[name].border &&
            mark.shadow === before.marks[name].shadow) ||
          (mark.border === after.marks[name].border &&
            mark.shadow === after.marks[name].shadow);
        expect(whole, `${name} at ${sample.t - tapAt} ms`).toBe(true);
      }
    }
  });

  test('a mouse keeps the theme’s transition (negative control)', async ({
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
      await watchCard(page, 'Pro');
      const at = await centreOf(page, 'Pro');
      await page.mouse.move(at.x, at.y);
      await untilCardStill(page, 'Pro');
      await page.mouse.click(at.x, at.y);
      const read = await readCard(page, 'Pro');
      expect(
        read.transitions.some(
          ({property, duration}) => property === 'border-color' && duration > 0,
        ) ||
          read.transitions.some(
            ({property, duration}) =>
              property.startsWith('border-') && duration > 0,
          ),
      ).toBe(true);
      expect(read.border).not.toBe((await settledMark(page, 'Pro')).border);
    } finally {
      await context.close();
    }
  });
});

// design:reduced-motion: under Reduce Motion the mark changes at once with a
// mouse (DR3); under a finger it already changes in one frame, within DR2.
test.describe('SelectableCard selection mark under Reduce Motion', () => {
  test('a finger gets an instant change', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openStory(page, storybook(), STORY);
    await watchCard(page, 'Pro');
    const driver = await touchDriver(page);
    await driver.tap(await centreOf(page, 'Pro'));
    const read = await readCard(page, 'Pro');
    expect(read.transitions.filter(({duration}) => duration > 0)).toEqual([]);
    expect(read.border).toBe((await settledMark(page, 'Pro')).border);
  });

  test('a mouse gets an instant change', async ({browser}) => {
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
      await watchCard(page, 'Pro');
      const at = await centreOf(page, 'Pro');
      await page.mouse.move(at.x, at.y);
      await untilCardStill(page, 'Pro');
      await page.mouse.click(at.x, at.y);
      const read = await readCard(page, 'Pro');
      expect(read.transitions.filter(({duration}) => duration > 0)).toEqual([]);
      expect(read.border).toBe((await settledMark(page, 'Pro')).border);
    } finally {
      await context.close();
    }
  });
});
